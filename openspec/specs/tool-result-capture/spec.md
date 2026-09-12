# Tool Result Capture Specification

## Purpose

Sero keeps the complete output of a bash command in a session-keyed file
outside the model context, and tells the agent where it is, so the agent and
the user can read what the model was not given.

## Requirements

### Requirement: Complete output is captured before truncation

The system SHALL stream the complete standard output and standard error of a
bash command into the session's capture file while the command runs, before the
model-facing content is truncated. The capture MUST NOT be bounded by an
in-memory capture limit. Truncation of the model-facing content MUST NOT reduce
what is persisted. The bash result SHALL report the capture path and byte size in
the model-visible content. A reported path SHALL be the path valid where the
command ran, and a stream record SHALL carry that runtime path only when it
differs from the host path, so a host workspace stores one path rather than the
same absolute path twice. Capture SHALL preserve the combined output and
separate byte-exact stdout and stderr files for each non-empty stream. Stream
files MUST contain no reporting text or truncation markers. All files in a
capture SHALL share its session references, reachability and cleanup policy.

#### Scenario: Output exceeds the model-facing limit

- **WHEN** a command produces more output than the model-facing line or byte limit
- **THEN** the persisted file holds the complete output, the model-visible content holds the existing truncated tail with its existing marker, and the model-visible content reports the capture path and size

#### Scenario: Output exceeds the former buffer limit

- **WHEN** a command produces more than the former 10 MB runtime buffer limit
- **THEN** the persisted file holds the complete output and the model-visible content reports its byte size

#### Scenario: Command exits non-zero

- **WHEN** a command fails and writes output to standard error
- **THEN** the persisted file holds both streams, the failure is still reported to the model, and the model-visible error text carries the capture path and size

#### Scenario: Command produces no output

- **WHEN** a command completes with no output on either stream
- **THEN** the system does not create a capture file and does not advertise one

#### Scenario: Capture metadata is structured for the UI

- **WHEN** a capture file is written
- **THEN** the result carries typed capture metadata for the UI and extensions, including completeness, host/runtime paths, byte size and stream identity, on success and failure

#### Scenario: Structured stdout with stderr diagnostics

- **WHEN** a command emits a valid JSON document on stdout and warnings on stderr
- **THEN** the stdout capture is byte-identical to that document and remains parseable, the stderr capture holds all warnings, and the combined capture preserves both streams

#### Scenario: Structured output exceeds both presentation limits

- **WHEN** a structured stdout document exceeds 50 KB or 2,000 lines
- **THEN** its complete stream file remains readable without rerunning the command and the model receives a bounded preview with a separate truncation notice and stream path

#### Scenario: Output is not valid UTF-8

- **WHEN** a command emits bytes that are not valid UTF-8 on either stream
- **THEN** each capture file holds those bytes unchanged, the reported byte size equals the number of bytes the command produced, and only the model-facing preview decodes with replacement characters

#### Scenario: One line exceeds the whole retained tail

- **WHEN** a command writes one line longer than the retained tail budget, with or without a terminating newline, and then writes more output
- **THEN** the model-facing preview keeps the newest bytes of that line and the later output, and a persistence failure does not lose the newest bytes

#### Scenario: A UTF-8 character spans pipe chunks

- **WHEN** a valid UTF-8 character is split across successive chunks on either pipe
- **THEN** the preview decodes it as one character, independently of chunks on the other pipe, and the capture files preserve the original bytes

### Requirement: Capturing complete output bounds memory

Streaming SHALL NOT retain unbounded output in memory. The system MUST bound
the bytes that wait to be written and MUST apply backpressure to the command's
pipes while that bound is reached. Backpressure MUST NOT drop, reorder or
truncate captured output. A command that produces more than the bound MUST still
be captured complete. Memory use MUST NOT scale with total command output.

#### Scenario: Command outruns the disk

- **WHEN** a command produces output faster than the capture files can be written
- **THEN** the runtime pauses the producing pipe while the pending writes reach the bound, resumes it when they drain, and the finished capture holds every byte the command produced

#### Scenario: Output far exceeds the bound

- **WHEN** a command produces much more output than the pending bound
- **THEN** the bytes held in memory stay bounded while the persisted capture remains complete and readable

### Requirement: Payload and reporting remain distinct

The bash output payload SHALL be distinct from capture, failure and status
reporting in the result content. Consumers MUST be able to identify each part
without parsing human-readable notices. Reports SHALL use runtime-valid paths;
host consumers SHALL receive host paths through typed metadata only. This
separation does not remove the ordinary bash payload's existing truncation.
Payload previews SHALL remain within the existing 50 KB / 2,000-line limits.
Reporting blocks are outside that payload budget, as existing truncation and
exit notices are. A truncated payload MUST be identified as a preview, not a
complete or parseable structured document. Reports SHALL identify the complete
combined output and available stream files with their individual byte counts. A
stream file that holds the same bytes as the combined output MUST NOT be listed
separately, in the report, in the viewer or in the capture metadata, because it
repeats one fact at double the cost. Streams that differ
from the combined output, such as stderr alongside stdout, SHALL be listed.
The UI SHALL distinguish the preview from complete output and allow each
stream file to be opened. Normal file-tool read limits still apply; complete
retrieval can require paged reads or local parsing of the file.

#### Scenario: Result carries a capture report

- **WHEN** a command produces output and a finalized capture
- **THEN** the output payload and capture report occupy separate identifiable content blocks

#### Scenario: A stream repeats the combined output

- **WHEN** every captured byte came from one stream, so that stream file is the combined file byte for byte
- **THEN** the record omits that stream, the report names the combined output once, and the viewer offers one file

#### Scenario: Streams differ from the combined output

- **WHEN** a command wrote to both streams
- **THEN** the report lists the combined output and each stream file with its own byte count

### Requirement: Capture files have session references

Each capture MUST identify its producing session. Results SHALL report only
captures produced by that session or inherited through its forked history.
The system MUST NOT advertise unrelated sessions' captures. Forking SHALL
preserve the captured output referenced by the copied branch and SHALL keep
historical paths valid without changing historical output text.

#### Scenario: Two unrelated sessions run commands

- **WHEN** two sessions each run a large command
- **THEN** each result names only its own captures

#### Scenario: A session forks

- **WHEN** a session forks a branch containing captured results
- **THEN** the fork inherits durable references to those captures and their existing paths remain valid

#### Scenario: A fork runs a new command

- **WHEN** a forked session runs a new command
- **THEN** the new capture identifies the fork as its producing session

### Requirement: The agent can reach the captured output

The reported path MUST be valid in the environment where the command ran and
MUST be resolvable by the agent's normal file-reading tools.

#### Scenario: Host workspace

- **WHEN** a host-backend session receives a bash result for a command with captured output
- **THEN** the reported path is under the agent directory and the agent's read tool resolves it

#### Scenario: Containerised workspace

- **WHEN** a container-backend session receives a bash result for a command with captured output
- **THEN** the reported path is valid inside the container and the agent's read tool resolves it

#### Scenario: Windows container mapping

- **WHEN** the host path contains a Windows drive letter and the command ran in a container
- **THEN** the reported path uses the container's mapping for that drive rather than the host form

### Requirement: The capture is mounted read-only into containers

The capture root MUST be mounted into workspace containers read-only, at the
identity-mapped path for the host platform. The containerised agent MUST NOT be
able to write to the capture root.

#### Scenario: Container reads a capture file

- **WHEN** a containerised session reads the reported capture path
- **THEN** the file is readable and complete, with normal file-tool pagination when needed

#### Scenario: Container writes to the capture root

- **WHEN** a containerised session attempts to create or modify a file under the capture root
- **THEN** the write fails and the session continues

#### Scenario: The capture root does not exist yet

- **WHEN** a workspace container is created before any command has produced captured output
- **THEN** the system creates the capture root before the container, so the read-only mount is applied and a reported path is reachable without recreating the container

### Requirement: Retention follows all referencing sessions

Deleting a session SHALL release its capture references. Captures MUST remain
available while any surviving session references them, including through a
fork. The system SHALL delete a capture after its last reference is released.
Startup cleanup SHALL account for inherited references and MUST NOT remove
captures when the session inventory cannot be read completely. This policy
provides no size or age limit for referenced output.

#### Scenario: Parent is deleted after a fork

- **WHEN** the parent is deleted and a surviving fork references its captured results
- **THEN** the fork can still open and read every inherited capture

#### Scenario: Last referencing session is deleted

- **WHEN** no session references a capture after deletion
- **THEN** the capture is removed without user action

#### Scenario: Orphans remain at start

- **WHEN** startup completes a session inventory and finds an unreferenced capture
- **THEN** that capture is removed, while captures inherited by surviving forks remain

#### Scenario: Session inventory is unreadable

- **WHEN** startup cannot establish all session references
- **THEN** cleanup retains potentially referenced captures and retries after the inventory becomes available

#### Scenario: Fork and deletion overlap

- **WHEN** a fork is committed while the parent is being deleted
- **THEN** deletion cannot remove captures referenced by the committed fork

#### Scenario: A command is still running

- **WHEN** a capture belongs to a command that has not published a result yet, and another session is deleted
- **THEN** cleanup does not remove that capture, whatever its age, until that command's own result is published

#### Scenario: Result publication is delayed

- **WHEN** an aged capture has finished but its result has not reached the session file
- **THEN** cleanup keeps the capture protected until an inventory observes its persisted reference
- **AND** a concurrent sweep with an older inventory cannot delete it after a newer inventory releases that protection

#### Scenario: Capture belongs to no surviving reference

- **WHEN** a command has published its result and no session references the capture
- **THEN** the capture becomes collectable and cleanup removes it

### Requirement: Capture failure never fails the command

If the complete output cannot be persisted, the command result MUST still be
returned with its existing model-facing truncation, and the absence of a capture
MUST be visible in that result.

#### Scenario: Capture root is not writable

- **WHEN** the capture root cannot be written
- **THEN** the command result retains the normal truncated tail and exit status, no capture path is advertised, an unavailable notice is shown, and the session continues

#### Scenario: Persistence fails after substantial output

- **WHEN** a capture write or finalization fails after output exceeds the model-facing limit
- **THEN** the process continues, the final bounded tail and exit status remain available, and no partial file is advertised as complete

#### Scenario: Capture file is removed while the command runs

- **WHEN** a capture file is no longer readable when the command finishes
- **THEN** the result reports the complete output as unavailable instead of reporting it as complete, and the command result, its bounded tail and its exit status are unchanged

### Requirement: The user can open the complete output

The desktop UI SHALL let the user open a bash result's complete output in a
surface separate from the model-facing content, so the two are never confused.
The UI MUST NOT restate what the model received: a truncated payload already
carries its own truncation marker, and a complete one needs no note.

#### Scenario: User expands a result with captured output

- **WHEN** the user opens the complete output for a bash result that has a capture file
- **THEN** the UI opens the complete output in its own surface, separate from the payload the model received

#### Scenario: Capture file is gone

- **WHEN** the user opens the complete output for a result whose capture file no longer exists
- **THEN** the UI reports that the complete output is unavailable rather than showing an empty view
