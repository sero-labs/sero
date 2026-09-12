## Purpose

Defines the model-facing contract for reading, writing, and editing workspace
files through Sero's runtime tools, so ChatPanel sessions and background
subagents get predictable matching, atomic multi-hunk edits, safe same-file
concurrency, and result feedback they can act on.

## ADDED Requirements

### Requirement: Apply several disjoint replacements in one call

The `edit` tool SHALL accept an ordered array of one or more replacements in a
single call. Each replacement's match text MUST resolve against the original
file content read when the call starts its serialized mutation, not against the
result of an earlier replacement in the same call. The system SHALL write the
file once per successful call. A match failure, ambiguity, overlap, or no-op
replacement MUST fail the whole call without writing.

#### Scenario: Several independent changes in one file

- **WHEN** one `edit` call supplies replacements for three separate regions of a file
- **THEN** all three replacements apply and the file is written once

#### Scenario: Overlapping replacements

- **WHEN** one `edit` call supplies replacements whose match regions overlap or nest
- **THEN** the call fails and no replacement is applied

#### Scenario: One replacement fails a multi-replacement call

- **WHEN** one replacement in a multi-replacement call cannot be matched, or matches more than once
- **THEN** the call fails, the file is left unchanged, and the error identifies the failing replacement

#### Scenario: Single replacement still works

- **WHEN** a caller supplies exactly one replacement
- **THEN** the tool accepts the existing `oldText`/`newText` form and applies the same matching and failure rules as a one-entry array

#### Scenario: No-op replacement in a mixed batch

- **WHEN** one replacement leaves its matched text unchanged and another replacement would change a separate region
- **THEN** the whole call fails without writing and identifies the no-op replacement

#### Scenario: Both input forms supplied

- **WHEN** a call supplies the ordered array and also the single replacement fields
- **THEN** the array is authoritative and no array entry is silently discarded

### Requirement: Preserve content when combining exact and fuzzy matches

Exact and fuzzy replacements in one call MUST address the intended regions of
the same original file. Fuzzy normalization MUST NOT shift another replacement
to a different region or cause overlap checks to use incompatible positions.
Unchanged lines MUST retain their whitespace and Unicode characters. The tool
SHALL retain the original BOM and the existing line-ending restoration policy.

#### Scenario: Mixed exact and fuzzy replacements

- **WHEN** a batch contains one fuzzy match and one exact match, with trailing whitespace before both regions
- **THEN** both replacements affect only their intended line regions, and unchanged lines retain their original whitespace and Unicode characters

#### Scenario: Overlap after fuzzy normalization

- **WHEN** an exact replacement and a fuzzy replacement resolve to overlapping original regions
- **THEN** the whole call fails without writing

#### Scenario: BOM and CRLF file

- **WHEN** a mixed exact/fuzzy batch changes a file with a UTF-8 BOM and CRLF line endings
- **THEN** the result retains the BOM and CRLF style, and unchanged lines retain their original whitespace and Unicode characters

### Requirement: Serialize concurrent mutations to the same file

The system SHALL serialize `edit` and `write` mutations to the same file across
sessions served by one Sero process. Each edit MUST read and validate current
content after earlier mutations settle. Compatible edits SHALL retain their
changes. If an earlier mutation invalidates a later edit's match, the later
edit MUST fail without writing. A whole-file `write` SHALL replace the current
content in its execution order; it does not merge prior edits. These rules MUST
hold for direct calls and calls issued from inside a program. They do not
coordinate external writers or separate Sero processes.

#### Scenario: Two compatible concurrent edits to one file

- **WHEN** two concurrent edit calls target separate regions and each match remains valid after the other edit
- **THEN** both changes are present in the final file

#### Scenario: Conflicting concurrent edits

- **WHEN** two concurrent edits target the same original text and the first mutation removes the second edit's match
- **THEN** the first edit succeeds, the second fails without writing, and the file retains the first edit's result

#### Scenario: Whole-file write follows an edit

- **WHEN** a whole-file write executes after an edit to the same file
- **THEN** the write waits for the edit to settle and the final file equals the write payload

#### Scenario: Edit follows a whole-file write

- **WHEN** an edit executes after a whole-file write to the same file
- **THEN** it matches against the written content and either applies to that content or fails without writing if its match is invalid

#### Scenario: Concurrent edits inside a program

- **WHEN** a program issues several edits to one file without awaiting each one in turn
- **THEN** the edits execute in sequence against current content, compatible changes remain present, and each call reports success or its match failure

#### Scenario: Aliases and sessions share serialization

- **WHEN** separate sessions in one Sero process mutate the same file through its direct path, a path containing `.` or `..`, or a stable symlink alias
- **THEN** those mutations share one serialization order on either backend

#### Scenario: Create through a symlinked directory

- **WHEN** two writes target one missing file through direct and symlinked paths to its existing parent directory
- **THEN** the writes share one serialization order

#### Scenario: Host and container access a known shared file

- **WHEN** host and container tools in one Sero process target the same backing file through a mount identified by the runtime
- **THEN** those mutations share one serialization order

#### Scenario: Identical paths in separate containers

- **WHEN** two calls target `/workspace/file.ts` in separate containers with separate backing files
- **THEN** neither mutation waits for the other file's mutation to settle

#### Scenario: Different files do not block each other

- **WHEN** two edits target different files at the same time
- **THEN** neither edit waits on the other

### Requirement: Honour cancellation before starting a write

An `edit` or `write` call cancelled while waiting for serialization or before
its write starts MUST fail without writing. Cancellation during a write MUST
NOT permit the next mutation to enter until that write settles. Cancellation
does not guarantee rollback of an already-started write. These rules SHALL
apply on both backends, including calls inside `run_code`.

#### Scenario: Cancel while queued

- **WHEN** a mutation is cancelled while another mutation holds the same file
- **THEN** the cancelled call performs no write when it reaches its turn, and later uncancelled calls can proceed

#### Scenario: Cancel during edit preparation

- **WHEN** cancellation arrives during the edit's file read or validation, before writing starts
- **THEN** the edit fails without writing

#### Scenario: Cancel during an in-flight write

- **WHEN** cancellation arrives after a write starts and another mutation is waiting for the same file
- **THEN** the next mutation remains blocked until the write settles, and the cancelled call does not claim that the file was left unchanged

### Requirement: Report what changed to the model

The `edit` result MUST describe the applied change in the content the model
reads. The description SHALL be bounded in size, and structured detail for
non-model consumers MUST remain available.

#### Scenario: Successful edit reports the change

- **WHEN** an edit applies
- **THEN** the model-readable result identifies the changed region and shows added and removed lines

#### Scenario: Large change is bounded

- **WHEN** an edit changes more content than the result budget allows
- **THEN** the result is truncated with an explicit marker instead of overflowing

#### Scenario: Display consumers still receive structured detail

- **WHEN** a UI or log consumer reads the edit result
- **THEN** it receives the structured change detail as before

### Requirement: Accurate failure feedback

When a replacement match fails, the system SHALL describe the matching rule it
actually applies and SHALL include a location hint when a near match exists.
The message MUST NOT claim a stricter rule than the matcher enforces.

#### Scenario: No match found

- **WHEN** a replacement's match text is absent from the file
- **THEN** the result states the real matching rule and names the nearest candidate region

#### Scenario: Ambiguous match

- **WHEN** a replacement's match text occurs more than once
- **THEN** the result states how many matches exist and asks for more context

#### Scenario: Replacement changes nothing

- **WHEN** a replacement resolves to text identical to what it replaces
- **THEN** the whole call fails without writing, identifies the no-op replacement, and explains that no change resulted

### Requirement: Preview every edit input form

The streaming preview SHALL show replacement text from `newText` for a single
edit and from each `edits[].newText` in array order for an array edit. If the
array is present, it MUST take precedence over the single replacement fields.
The preview MUST tolerate incomplete streamed entries and count only available
replacement text. Its existing tail limit SHALL apply across the whole preview.

#### Scenario: Array-only edit preview

- **WHEN** a streamed edit contains several array entries and no top-level `newText`
- **THEN** the preview shows the available replacement text in array order and the total replacement line count, with distinct entries separated visually

#### Scenario: Both forms in the preview

- **WHEN** a streamed edit contains an array and top-level replacement fields
- **THEN** the preview shows only the array's available replacement text and does not fall back to the top-level text while array entries are incomplete

#### Scenario: Incomplete streamed entry

- **WHEN** some entries have string replacement text and another entry has no `newText` yet
- **THEN** the preview shows the available strings without an error and updates as more text arrives

#### Scenario: Single replacement and write previews

- **WHEN** a call contains a single edit replacement or a whole-file write payload
- **THEN** the preview reads `newText` for the edit and `content` for the write, retaining the existing tail limit and line-count rules

### Requirement: Expose core file tools in the session system prompt

Each core runtime file tool SHALL provide a one-line summary and its guideline
bullets, so the session system prompt lists the tool under its available tools.

#### Scenario: Session prompt lists the core tools

- **WHEN** a ChatPanel session or a subagent session starts
- **THEN** the system prompt lists the core file tools with their one-line summaries instead of reporting none

#### Scenario: Tool not active in the session

- **WHEN** a tool is excluded by the session's tool policy
- **THEN** that tool does not appear in the system prompt

### Requirement: Guide the model to batch mutation work

Tool guidance SHALL state that one `edit` call carries several disjoint
replacements, and that a program can apply several mutations in one turn. The
guidance SHALL stay consistent with the serialization guarantee.

#### Scenario: Batching guidance is present

- **WHEN** the model reads the `edit` and `run_code` tool descriptions
- **THEN** both state that several replacements belong in one call or one program

#### Scenario: Guidance does not contradict the concurrency guarantee

- **WHEN** guidance recommends issuing several mutations in one program
- **THEN** it states that edits validate current content in sequence and does not promise that conflicting edits or edits followed by whole-file writes all survive

### Requirement: Equal behaviour on host and container runtimes

Both runtime backends SHALL expose the same edit contract, including the same
matching rule, the same all-or-nothing application, the same serialization, and
equivalent result feedback.

#### Scenario: Same multi-hunk call on both backends

- **WHEN** the same multi-replacement call runs on the host runtime and on the container runtime
- **THEN** both produce the same file content and equivalent result feedback

#### Scenario: Same failure on both backends

- **WHEN** the same unmatched replacement runs on the host runtime and on the container runtime
- **THEN** both fail without writing and report an equivalent message
