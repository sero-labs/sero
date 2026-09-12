## 1. Shared edit core and mutation queue

- [ ] 1.1 Add a mutation queue module beside `edit-helpers.ts`, keyed by filesystem identity and backend-canonical path. Verify mutations to one file run in sequence and mutations to different files do not block each other.
- [ ] 1.2 Cover nested and re-entrant acquisition of the same path in that module, then verify a nested acquisition does not deadlock and releases the lock only after the outermost mutation settles.
- [ ] 1.3 Extract the edit implementation into one shared module that takes a file read/write port and canonical file identity. Verify both ports pass the existing edit tests, changing expectations only for the specified feedback and unchanged-line preservation corrections.
- [ ] 1.4 Wire `tools-coding.ts` and `tools-host.ts` to the shared module, then verify the full desktop test suite passes and `tools-host.ts` stays at or below 500 lines.
- [ ] 1.5 Route `write` on both backends through the same queue as `edit`. Use controlled I/O barriers to verify a write after an edit replaces the file with its payload, and an edit after a write reads that payload and either applies or fails its match without writing.
- [ ] 1.6 Resolve file aliases through the target backend, including missing targets under symlinked parents. Verify host and container tests cover direct paths, `.`/`..`, symlinks, and separate sessions or factories accessing the same file. Verify separate container files at identical paths do not block each other, and a known shared host mount uses the host file identity.
- [ ] 1.7 Check cancellation after queue admission, after awaited preparation, and immediately before writing. On both backends, use controlled barriers to verify queued `edit` and `write` calls cancelled before admission never write, an edit cancelled during its read never writes, and later uncancelled calls proceed.
- [ ] 1.8 Hold the lock until an in-flight write settles after cancellation. Verify this for both tools on both backends, that a waiting mutation cannot enter early, and that feedback does not claim rollback. Include cancellation propagated from `run_code` and verify a rejected write releases the queue for later calls.

## 2. Multi-replacement support

- [ ] 2.1 Extend the edit parameter schema with an ordered replacement array, then verify schema tests accept the single form, the array form, and both forms together.
- [ ] 2.2 Apply every replacement against the original content and write once per call, then verify a test with three separate regions in one file produces all three changes and exactly one write.
- [ ] 2.3 Reject overlapping and nested replacement regions, then verify the call fails and the file is unchanged.
- [ ] 2.4 Make a multi-replacement call all-or-nothing, then verify an unmatched or ambiguous replacement leaves the file byte-identical and the error names the failing replacement.
- [ ] 2.5 Make the array authoritative when a call supplies both forms, then verify a test asserts no array entry is discarded.
- [ ] 2.6 Verify compatible concurrent edits retain both changes for direct calls and inside `run_code`. Add conflicting edits against the same original text and verify the first succeeds while the later invalid match fails without overwriting it.
- [ ] 2.7 Resolve exact and fuzzy hunks in one common content view and preserve unchanged lines when mapping the result back. Verify mixed hunks with trailing whitespace before both regions, overlap after normalization, unchanged Unicode characters, and BOM/CRLF preservation. Verify a single fuzzy replacement also preserves unchanged lines.
- [ ] 2.8 Reject a batch containing any no-op replacement and identify its index. Verify a batch with one no-op and one real change performs no write and leaves the file byte-identical, as does a one-entry no-op batch.

## 3. Result feedback

- [ ] 3.1 Put the changed region with added and removed lines into the model-visible result content, then verify a test asserts the changed lines appear in the result text.
- [ ] 3.2 Cap the shown lines and bytes and add an explicit truncation marker, then verify a test with an oversized change returns the marker and stays within the cap.
- [ ] 3.3 Keep the structured change detail on the result for non-model consumers, then verify the existing UI and log consumer tests still pass.
- [ ] 3.4 Replace the failed-match message with one that states the real matching rule and names the nearest candidate region, then verify tests cover a miss, an ambiguous match, and a no-op replacement.
- [ ] 3.5 Update existing assertions that pin the previous success and failure strings, then verify the desktop test suite passes.

## 4. Prompt guidance

- [ ] 4.1 Add a one-line summary and guideline bullets to each core runtime file tool, then verify a test asserts the rendered session system prompt lists the tools instead of reporting none.
- [ ] 4.2 Add batching guidance to the `edit` and `run_code` descriptions. Verify both describe batching and current-content validation without promising that conflicting edits or edits followed by whole-file writes all survive.
- [ ] 4.3 Verify the guideline set does not contradict an active search tool, then verify the rendered prompt with and without search tools active is consistent.

## 5. Renderer

- [ ] 5.1 Fix `StreamingFileWrite.tsx` to select `content` for writes, top-level `newText` for single edits, and `edits[].newText` for array edits. Verify render tests show array text in order with entry separators and correct total line counts, while single-edit and write previews retain their current count rules.
- [ ] 5.2 Handle partial streamed array entries and array precedence. Verify missing `newText` values cause no error, available strings appear as they arrive, empty strings count as zero lines, and top-level fields never replace an incomplete array preview. Verify the 200-line tail budget applies across all entries and separators do not inflate the replacement line count.

## 6. Cross-cutting verification

- [ ] 6.1 Run the same mixed exact/fuzzy batch, unmatched batch, and mixed no-op batch against host and container adapters. Verify equivalent file content, unchanged-line preservation, write counts, and result feedback. Confirm the backend coverage in tasks 1.5 through 1.8 also passes.
- [ ] 6.2 Run `pnpm typecheck` from the monorepo root, then verify the renderer and Electron main-process types pass with no errors.
- [ ] 6.3 Confirm every touched source file is at or below 500 lines, then verify the count for each changed file.

## 7. Evaluation

- [ ] 7.1 Add an eval provider mode that builds its session from Sero's host file-tool factory with Pi's built-in tools disabled, then verify a recorded scenario ran the runtime-backed tool and not Pi's built-in counterpart.
- [ ] 7.2 Add a metric assertion beside `eval/assertions/toolSequence.ts` that reads each call's arguments, then verify it scores one call carrying several replacements above several single-replacement calls against the same file.
- [ ] 7.3 Extend that assertion to report replacements per call, consecutive same-file edit runs, calls by tool name, result tokens, latency, and failure count, then verify every metric appears in the assertion reason.
- [ ] 7.4 Add file-edit scenarios for several independent changes in one file, a block move, a duplicate-text ambiguity, a file changed after the read, a failed edit followed by recovery, and an intentional whole-file replacement, then verify every scenario runs in the suite.
- [ ] 7.5 Record the pre-change baseline on a fixed model, thinking level, prompt, and workspace snapshot, then verify the recorded run reports the share of edit calls inside runs of three or more and the total tool calls.
- [ ] 7.6 Re-run the same task set and settings after implementation, then verify the share of edit calls inside runs of three or more fell and no acceptance check regressed.
- [ ] 7.7 Set the model-visible diff cap from the recorded token data, then verify the cap holds for both a small and an oversized change.
- [ ] 7.8 Run `pnpm eval:snapshot` and the prompt-stability suite, then verify the baselines still pass and update one only when the tool-summary change is intended.
