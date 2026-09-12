## Purpose

Sero keeps the complete output of a bash command in a session-keyed file
outside the model context, and tells the agent where it is, so the agent and
the user can read what the model was not given.

## ADDED Requirements

### Requirement: Complete output is captured before truncation

The system SHALL stream the complete standard output and standard error of a
bash command into the session's spill file while the command runs, before the
model-facing content is truncated. The spill MUST NOT be bounded by an
in-memory capture limit. Truncation of the model-facing content MUST NOT reduce
what is persisted. The bash result SHALL report the spill path and byte size in
the model-visible content. Capture SHALL preserve the combined output and
separate byte-exact stdout and stderr files for each non-empty stream. Stream
files MUST contain no reporting text or truncation markers. All files in a
capture SHALL share its session references, reachability and cleanup policy.

#### Scenario: Output exceeds the model-facing limit

- **WHEN** a command produces more output than the model-facing line or byte limit
- **THEN** the persisted file holds the complete output, the model-visible content holds the existing truncated tail with its existing marker, and the model-visible content reports the spill path and size

#### Scenario: Output exceeds the former buffer limit

- **WHEN** a command produces more than the former 10 MB runtime buffer limit
- **THEN** the persisted file holds the complete output and the model-visible content reports its byte size

#### Scenario: Command exits non-zero

- **WHEN** a command fails and writes output to standard error
- **THEN** the persisted file holds both streams, the failure is still reported to the model, and the model-visible error text carries the spill path and size

#### Scenario: Command produces no output

- **WHEN** a command completes with no output on either stream
- **THEN** the system does not create a spill file and does not advertise one

#### Scenario: Spill metadata is structured for the UI

- **WHEN** a spill file is written
- **THEN** the result carries typed capture metadata for the UI and extensions, including completeness, host/runtime paths, byte size and stream identity, on success and failure

#### Scenario: Structured stdout with stderr diagnostics

- **WHEN** a command emits a valid JSON document on stdout and warnings on stderr
- **THEN** the stdout spill is byte-identical to that document and remains parseable, the stderr spill holds all warnings, and the combined spill preserves both streams

#### Scenario: Structured output exceeds both presentation limits

- **WHEN** a structured stdout document exceeds 50 KB or 2,000 lines
- **THEN** its complete stream file remains readable without rerunning the command and the model receives a bounded preview with a separate truncation notice and stream path

### Requirement: Payload and reporting remain distinct

The bash output payload SHALL be distinct from spill, failure and status
reporting in the result content. Consumers MUST be able to identify each part
without parsing human-readable notices. Reports SHALL use runtime-valid paths;
host consumers SHALL receive host paths through typed metadata only. This
separation does not remove the ordinary bash payload's existing truncation.
Payload previews SHALL remain within the existing 50 KB / 2,000-line limits.
Reporting blocks are outside that payload budget, as existing truncation and
exit notices are. A truncated payload MUST be identified as a preview, not a
complete or parseable structured document. Reports SHALL identify the complete
combined output and available stream files with their individual byte counts.
The UI SHALL distinguish the preview from complete output and allow each
stream file to be opened. Normal file-tool read limits still apply; complete
retrieval can require paged reads or local parsing of the file.

#### Scenario: Result carries a capture report

- **WHEN** a command produces output and a finalized capture
- **THEN** the output payload and capture report occupy separate identifiable content blocks

### Requirement: Spill files have session references

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

### Requirement: The agent can reach the spilled output

The reported path MUST be valid in the environment where the command ran and
MUST be resolvable by the agent's normal file-reading tools.

#### Scenario: Host workspace

- **WHEN** a host-backend session receives a bash result for a spilled command
- **THEN** the reported path is under the agent directory and the agent's read tool resolves it

#### Scenario: Containerised workspace

- **WHEN** a container-backend session receives a bash result for a spilled command
- **THEN** the reported path is valid inside the container and the agent's read tool resolves it

#### Scenario: Windows container mapping

- **WHEN** the host path contains a Windows drive letter and the command ran in a container
- **THEN** the reported path uses the container's mapping for that drive rather than the host form

### Requirement: The spill is mounted read-only into containers

The spill root MUST be mounted into workspace containers read-only, at the
identity-mapped path for the host platform. The containerised agent MUST NOT be
able to write to the spill root.

#### Scenario: Container reads a spill file

- **WHEN** a containerised session reads the reported spill path
- **THEN** the file is readable and complete, with normal file-tool pagination when needed

#### Scenario: Container writes to the spill root

- **WHEN** a containerised session attempts to create or modify a file under the spill root
- **THEN** the write fails and the session continues

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

### Requirement: Spill failure never fails the command

If the complete output cannot be persisted, the command result MUST still be
returned with its existing model-facing truncation, and the absence of a spill
MUST be visible in that result.

#### Scenario: Spill root is not writable

- **WHEN** the spill root cannot be written
- **THEN** the command result retains the normal truncated tail and exit status, no spill path is advertised, an unavailable notice is shown, and the session continues

#### Scenario: Persistence fails after substantial output

- **WHEN** a spill write or finalization fails after output exceeds the model-facing limit
- **THEN** the process continues, the final bounded tail and exit status remain available, and no partial file is advertised as complete

### Requirement: The user can open the complete output

The desktop UI SHALL let the user open a bash result's complete output, and
MUST distinguish that complete output from the model-facing content.

#### Scenario: User expands a spilled result

- **WHEN** the user opens the complete output for a bash result that has a spill file
- **THEN** the UI opens the complete output and identifies whether the model received all output or a bounded preview

#### Scenario: Spill file is gone

- **WHEN** the user opens the complete output for a result whose spill file no longer exists
- **THEN** the UI reports that the complete output is unavailable rather than showing an empty view
