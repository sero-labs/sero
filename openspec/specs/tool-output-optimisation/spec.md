# Tool Output Optimisation Specification

## Purpose

Lets a user reduce the shell output that reaches the model, using pinned RTK
command rewriting and category-aware result compaction, while keeping the
complete executed-command output reachable in capture files and model previews
bounded. Category rules preserve diagnostics before preview truncation.

## Requirements

### Requirement: Complete captures back bounded previews

For eligible calls with a finalized readable capture, result compaction SHALL
consume complete executed-command output, not the bash tool's truncated tail.
Category preservation requirements below apply to the complete compaction
candidate before presentation. The model-facing preview SHALL retain the
existing 50 KB / 2,000-line payload limits; exceeding either limit MUST NOT
truncate the persisted source capture. The preview SHALL indicate omissions
and identify complete readable capture paths and sizes in a separate report.
The preview is not guaranteed to contain every diagnostic or matched line.

Complete output means bytes emitted by the command that actually executed.
RTK filtering precedes capture and is not reversed by the plugin. Requested
structured output bypasses rewriting as specified below. Capture failures
follow the fail-open requirement and MUST NOT claim complete recovery.

#### Scenario: Early warning falls outside the original tail

- **WHEN** a warning is followed by more than 2,000 lines of removable progress
- **THEN** compaction reads the complete capture, retains the warning in its candidate, and the warning appears in the preview if that candidate fits

#### Scenario: Protected data alone exceeds the limit

- **WHEN** diagnostics or matched lines cannot all fit in the preview
- **THEN** the preview stays bounded, reports its omissions, and all original diagnostics and matches remain in the complete capture

#### Scenario: No complete capture

- **WHEN** a capture is incomplete or unreadable
- **THEN** the plugin returns the existing bash preview and status without further compaction or a complete-recovery claim

### Requirement: Optimisation is opt-in

Output optimisation MUST be disabled for a new profile. Disabled, the system
MUST run commands exactly as written and MUST deliver tool results unmodified.

#### Scenario: New profile

- **WHEN** a profile has never enabled output optimisation
- **THEN** every command runs as written and every result reaches the model unmodified

#### Scenario: Enabled for a profile

- **WHEN** the user enables output optimisation
- **THEN** subsequent shell commands in that profile are eligible for rewriting and their results for compaction

#### Scenario: Disabled again

- **WHEN** the user disables output optimisation
- **THEN** subsequent commands run as written and results are unmodified, with no restart required

### Requirement: Supported commands are rewritten before execution

Subject to the exclusions, bypass and format requirements, when optimisation
is enabled and a supported command has an RTK equivalent, the
system SHALL execute the RTK equivalent. It MUST NOT rewrite a command that RTK
does not offer an equivalent for. It MUST treat exit code 0 and exit code 3 as
a supported rewrite, exit code 1 as no equivalent, exit code 2 as declined, and
any other outcome as a failure. Codes 0, 3 and 2 reflect upstream allow,
ask/default and deny decisions, not filter modes. They MUST NOT grant or bypass
Sero execution permission. Every non-rewrite outcome MUST leave the original
command subject to Sero's normal execution and permission checks.

#### Scenario: A supported command

- **WHEN** the agent runs a command that RTK supports
- **THEN** the RTK equivalent executes and the agent receives the command's output

#### Scenario: An unsupported command

- **WHEN** the agent runs a command with no RTK equivalent
- **THEN** the command runs exactly as written

#### Scenario: RTK declines the command

- **WHEN** RTK exits 2 for a command
- **THEN** the command runs exactly as written and no rewrite is recorded

### Requirement: Rewriting fails open

If RTK is unavailable, declines the command, fails, or does not answer in time,
the original command MUST run. A rewriting failure MUST NOT change the command's
result, its exit code, or the session state.

#### Scenario: RTK is unavailable

- **WHEN** a command is eligible for rewriting but RTK cannot be resolved
- **THEN** the original command runs and its result is unaffected

#### Scenario: Rewriting errors or times out

- **WHEN** the rewrite attempt fails or exceeds its time budget
- **THEN** the original command runs and the session continues

### Requirement: Rewriting is disabled for measured-loss commands

The system MUST NOT rewrite search commands, and MUST NOT rewrite the lossy Git
history and diff forms (`git log`, `git diff`, `git show`). The search exclusion
SHALL cover a search command that appears anywhere in a pipe or a compound
command, not only the top-level command. On Windows, the system MUST NOT
rewrite a command that contains a top-level pipe.

#### Scenario: A search command runs

- **WHEN** the agent runs a file-content search
- **THEN** the search runs unmodified and its raw output is what the system compacts

#### Scenario: A search command inside a pipe

- **WHEN** the agent runs a non-search command that pipes into `grep`, `rg`, or `find`
- **THEN** the whole command runs unmodified

#### Scenario: A lossy Git form runs

- **WHEN** the agent runs `git log`, `git diff`, or `git show`
- **THEN** the command runs unmodified

#### Scenario: A piped command on Windows

- **WHEN** the agent runs a command with a top-level pipe on Windows
- **THEN** the command runs unmodified

### Requirement: Search output keeps every path and matched line

The system SHALL group search output by file itself, keeping every file path
complete and every matched line complete. When grouping does not reduce the
byte count, the complete candidate MUST remain the raw output. Only the
subsequent bounded-preview step may omit content, with the complete source
remaining in the capture. Preview grouping MUST NOT abbreviate a path or present
a partial matched line as a valid edit anchor.

#### Scenario: Grouped search output

- **WHEN** search output is compacted
- **THEN** the complete grouped candidate keeps every path and matched line in full, and each match displayed as an edit anchor in its preview is complete

#### Scenario: A search result becomes an edit anchor

- **WHEN** the agent copies a path and a matched line from compacted search output into an edit
- **THEN** both resolve against the file, because neither was abbreviated or truncated

#### Scenario: Grouping does not reduce size

- **WHEN** grouping search output by file would not reduce the byte count
- **THEN** the complete candidate stays unchanged, and its bounded preview reports any presentation omissions with a link to the complete capture

### Requirement: The executed command is visible

When a command was rewritten, the result SHALL record both the command that was
requested and the command that ran, so the two are distinguishable. The record
SHALL carry the RTK form; the bound executable path and the session's RTK state
environment repeat on every rewritten command and are not persisted.

The model context MUST NOT carry the rewrite. The model asked for the requested
command and receives that command's output; naming the wrapper is information it
cannot act on, and the measured-loss exclusions already cover the commands where
RTK changes meaning. The full-output viewer SHALL show the requested and executed
commands. When no rewrite occurred, the result MUST NOT record one.

#### Scenario: Command was rewritten

- **WHEN** a result is recorded for a rewritten command
- **THEN** the result details name the command that executed and the command that was requested, so the viewer can tell which command ran

#### Scenario: The model context stays unchanged

- **WHEN** the agent receives a result for a rewritten command
- **THEN** the model-visible content carries the output and no rewrite notice, and the executed command is available only in the result details

#### Scenario: Command was not rewritten

- **WHEN** a result is recorded for a command that ran as written
- **THEN** the result carries no rewrite record, and the viewer shows no executed command

### Requirement: Safe categories are compacted

The system SHALL compact completed shell output for these categories: test
runs, builds and type checks, linters, Git status and log, and package-manager
commands. Compaction MUST preserve failures, errors, warnings, file paths, line
numbers, commit messages and exit codes in the complete candidate. The
bounded-preview requirement determines what fits in model-visible content.

#### Scenario: Test run with failures

- **WHEN** a test run produces failures
- **THEN** the complete candidate retains every failure and the run summary, and detail for passing tests without protected data may be omitted

#### Scenario: Build or type check

- **WHEN** a build or type check reports errors or warnings
- **THEN** the complete candidate retains each error and warning with its file and line

#### Scenario: Linter run

- **WHEN** a linter reports diagnostics
- **THEN** the complete candidate groups diagnostics and retains their counts

#### Scenario: Git status or log

- **WHEN** a Git command reports working-tree or history information
- **THEN** the complete candidate retains all changed paths, commit identifiers and full commit messages

#### Scenario: Package-manager command

- **WHEN** a package manager reports progress
- **THEN** progress without protected data may be omitted and errors remain in the complete candidate

#### Scenario: Command fails

- **WHEN** a compacted command exits non-zero
- **THEN** the result report keeps the exit code and failure status visible even if diagnostic details exceed the bounded preview

### Requirement: Category rules preserve diagnostics before presentation

Category rules MUST NOT remove an error, warning, file path, line number,
commit identifier, commit message, matched line or exit code from the complete
candidate to reduce size. If a rule cannot prove an omission is safe, it MUST
keep the source text. Presentation can omit content under the bounded-preview
requirement, but MUST NOT remove it from the persisted source. For an
unrecognized unstructured category, the existing bash content SHALL be returned unchanged;
its complete capture still contains anything omitted by ordinary truncation.

#### Scenario: Nothing is compactable

- **WHEN** an unstructured command's output contains no recognised category
- **THEN** the result reaches the model unchanged

#### Scenario: A rule would remove a diagnostic

- **WHEN** a category rule's result would omit an error, warning, path, line number, commit message or matched line
- **THEN** the diagnostic is kept and the omission is not applied

### Requirement: Requested structured output stays exact in capture files

Commands that request machine-readable output SHALL bypass RTK rewriting and
plugin content transformations, including ANSI stripping. Their captured
stdout and stderr stream files MUST remain byte-exact. Reporting text MUST
NOT be inserted into those files or their payload content block. Sero does not
repair invalid structured output produced by the command itself.

For an eligible structured command with complete capture, stdout SHALL be the
preview payload and stderr SHALL remain independently readable. If stdout fits
both presentation limits, its complete text SHALL be delivered unchanged in
the payload block. Otherwise Sero SHALL return a bounded preview explicitly
identified as incomplete, with the complete stdout path and byte size in a
separate report. The preview need not parse; a captured valid document MUST
remain parseable from its file. Status and stderr reporting remain separate
from stdout. Normal file-tool limits can require paged reads or local parsing.

#### Scenario: Small structured stdout with warnings

- **WHEN** a command requests JSON and emits a valid small JSON document on stdout plus warnings on stderr
- **THEN** the payload contains the unchanged parseable JSON, the stdout capture contains exactly the same bytes, and stderr and reporting text do not contaminate either

#### Scenario: Structured output exceeds the presentation limits

- **WHEN** a requested structured document exceeds 50 KB or 2,000 lines
- **THEN** the model receives an explicitly incomplete bounded preview and the reported stdout file contains the entire original document in its requested format

#### Scenario: Structured output bypasses transformations

- **WHEN** RTK offers a rewrite or a category rule for a command requesting machine-readable output
- **THEN** the command executes as written and neither RTK nor plugin content filtering transforms its structured streams

#### Scenario: Structured command fails

- **WHEN** a structured command exits non-zero
- **THEN** its exact stdout and stderr remain in successfully captured files, and failure status is reported separately without claiming that the command produced valid structured data

### Requirement: The complete output stays reachable

When a complete capture is available, a compacted result SHALL report its
location and size in
the model-visible content, and SHALL keep the report the bash tool added, unless
the model payload already carries the complete captured output. In that case the
plugin MUST omit the report block: it would cost more context than the output it
points at, and the complete output is still openable from the result details.
The
system MUST NOT require the original command to be rerun to obtain it.

#### Scenario: A compacted result

- **WHEN** the agent receives a compacted result for a command with captured output
- **THEN** the model-visible content reports where the complete output is and how large it is

#### Scenario: The payload already holds everything

- **WHEN** compaction omitted nothing and the preview was not truncated, so the model payload is the complete captured output
- **THEN** the result omits the capture report block and the complete output remains openable from the result details

#### Scenario: The agent retrieves omitted content

- **WHEN** the agent reads the reported location with its normal file tools
- **THEN** it can retrieve all captured output with normal file tools, using pagination or local parsing when needed, without rerunning the command

#### Scenario: The user opens the complete output

- **WHEN** the user opens the complete output for a compacted result
- **THEN** the UI shows the complete text in its own surface, separate from the payload the model received

### Requirement: Captures open in a dedicated viewer

A tool result SHALL NOT render captured output inline, so a tool call MUST NOT
accumulate a log as the user reads it. Selecting a capture file SHALL open a
dedicated viewer surface that can display it. That surface MUST NOT require
relaxing the editor's workspace path policy, and captures MUST NOT be copied or
linked into a workspace to make them reachable.

#### Scenario: The tool result stays bounded

- **WHEN** a result carries a large capture
- **THEN** the result renders a file control only, and no captured output is rendered in the tool call

#### Scenario: The user opens a large capture

- **WHEN** the user selects the capture file for a result
- **THEN** it opens in a dedicated viewer surface that reports its size and navigates the file without loading all of it into the tool call

#### Scenario: A capture outside every workspace

- **WHEN** the capture file is outside all workspace roots
- **THEN** the viewer opens it without weakening the editor's workspace path policy, and no capture is copied or linked into a workspace

### Requirement: Compaction fails open

If compaction fails or a complete capture cannot be read, the original bash
payload, existing reports and error status MUST be preserved and the session
MUST continue. If rewriting occurred, the plugin MUST still add the separate
report identifying the requested and executed commands. This report is
independent of compaction and MUST NOT alter the preserved payload or status.
The plugin MUST NOT compact a truncated tail when the complete capture is
unavailable. Accounting metadata may record that compaction was
skipped. A command already executed through RTK MUST NOT be rerun as a fallback.

#### Scenario: Compaction throws

- **WHEN** a compaction rule fails on a result
- **THEN** the original bash payload, existing reports and error status reach the model without a new error state, and any required execution report remains separate

#### Scenario: Complete capture is missing or incomplete

- **WHEN** persistence failed or the capture cannot be read before compaction
- **THEN** the received bash payload, existing reports and error status are preserved, no further output is omitted, and no nonexistent recovery path is added

#### Scenario: Capture fails after a command was rewritten

- **WHEN** a rewritten command executes but its complete capture is unavailable
- **THEN** the result preserves the received payload and error status and separately reports both the requested and executed commands without rerunning the command

#### Scenario: Compaction throws after a command was rewritten

- **WHEN** a rewritten command executes and its compaction rule throws
- **THEN** the result preserves the received payload and error status and separately reports both the requested and executed commands without rerunning the command

### Requirement: A single command can bypass optimisation

The user SHALL be able to bypass optimisation for one command without changing
the profile setting, and the bypass MUST NOT affect later commands. The bypass
marker is a trailing `# no-opt` line comment.

#### Scenario: Bypass one command

- **WHEN** a command ends with the `# no-opt` marker
- **THEN** that command is neither rewritten nor compacted, and later commands remain optimised

### Requirement: Rewriting can be disabled per command class

Settings SHALL provide an independent switch for each class of rewritten
command, so a single problematic class can be turned off without disabling
optimisation or shipping a new release. The classes are file reads, Git,
containers, GitHub, tests, builds and type checks, package managers, and other.
The plugin SHALL classify every RTK invocation in the returned command and
MUST apply each switch before execution. If any affected class is disabled,
the entire rewrite MUST be discarded.

#### Scenario: Disable one class

- **WHEN** the user disables one command class
- **THEN** commands of that class run as written and other classes continue to be rewritten

### Requirement: Session metrics measure plugin compaction

The system SHALL measure complete captured executed-command output before
plugin compaction and the complete candidate after plugin compaction, in UTF-8
bytes before presentation limits and without reporting notices. This baseline
is after RTK filtering. The system MUST NOT claim RTK, native-command or
provider billing savings from these counts.

Eligible calls are ordinary bash calls while optimization is enabled and
without a bypass marker. Every eligible call with complete capture SHALL enter
the denominator, including unchanged calls with zero savings. Incomplete
captures SHALL be shown as unmeasured and excluded from byte totals. Confirmed
successful capture completion with zero output SHALL count as measured zero
input and output bytes, even though the host creates no capture record. It
MUST NOT increase the unmeasured-call count. An absent record alone MUST NOT
be treated as proof of zero output. Session reduction SHALL equal total removed
bytes divided by total input bytes. A zero
denominator SHALL display no percentage. Replaying a result MUST NOT count it
twice.

#### Scenario: Changed and unchanged commands

- **WHEN** eligible calls have input/output byte counts of 1000/500 and 1000/1000
- **THEN** the session reports 2000 input bytes, 1500 compacted bytes and 25 percent reduction

#### Scenario: RTK rewrites a command

- **WHEN** RTK filters output before Sero captures it
- **THEN** plugin metrics start from the captured RTK output and do not infer the original native command's byte count

#### Scenario: Capture fails

- **WHEN** an eligible call has no complete capture and is not confirmed to have completed capture successfully with zero output
- **THEN** it contributes no byte totals and increases the unmeasured-call count

#### Scenario: Command produces no output

- **WHEN** an eligible call completes capture successfully with zero bytes on both streams and the host creates no capture record
- **THEN** it records zero input and output bytes, does not increase the unmeasured-call count, and displays no percentage if the session total input remains zero

#### Scenario: Replay or fork

- **WHEN** results are replayed or inherited by a fork
- **THEN** each session counts each result in its own history once

#### Scenario: No measured output

- **WHEN** the total input byte count is zero
- **THEN** the UI shows no reduction percentage

### Requirement: Non-shell tools are untouched

The system MUST NOT rewrite or compact tool results that are not shell command
results. File reads SHALL remain exact.

#### Scenario: File read

- **WHEN** the agent reads a file with its file-reading tool
- **THEN** the content is exact and unmodified

#### Scenario: Programmatic tool call

- **WHEN** the agent runs a program that calls shell tools
- **THEN** the plugin recognises the guaranteed nested-call marker and neither rewrites nor compacts it, and the program's result is unmodified

#### Scenario: Ordinary call on a compatible host

- **WHEN** an ordinary bash call has no nested prefix and the host guarantees the nested-call convention
- **THEN** it remains eligible for optimization

#### Scenario: Host lacks the nested-call contract

- **WHEN** the host does not advertise the required nested-call capability
- **THEN** the plugin leaves all commands and results unmodified
