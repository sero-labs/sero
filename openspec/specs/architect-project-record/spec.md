## Purpose

The project record is the single durable source of truth for one Sero Architect project: what the user asked for, what the Architect decided, where the work stands, and what the user must answer.

## Requirements

### Requirement: One durable record per project
The system SHALL keep one project record per Architect project under the active profile, with a watched index that lists every project. The record MUST contain the user's idea verbatim, the Architect's brief, the linked workspace, the phase, the milestones, the decisions, the directives, the research results, the dispatch ledger, the budget and usage, and a history of transitions with their causes. The record MUST be JSON-serialisable.

#### Scenario: Idea kept verbatim
- **WHEN** the user submits an idea at intake
- **THEN** the record stores the idea text unchanged, and later edits to the brief do not alter it

#### Scenario: Index lists every project
- **WHEN** a project is created, changes phase, or is deleted
- **THEN** the index is updated in the same operation and any watcher of the index is notified without polling

### Requirement: Lifecycle phases and overlays
A project SHALL be in exactly one phase: `intake`, `discovery`, `charter`, `build`, `release`, or `maintain`. A project MAY carry at most one overlay: `decision`, `blocked`, `paused`, or `limited`. Every phase transition MUST be recorded in history with its cause and timestamp. A transition forward from `charter` MUST NOT occur without a recorded user approval of the charter.

#### Scenario: Charter approval gates build
- **WHEN** the Architect submits a charter and the user has not approved it
- **THEN** the project stays in `charter` and no milestone work is dispatched

#### Scenario: Limit is not progress
- **WHEN** the project reaches its cost cap during `build`
- **THEN** the overlay becomes `limited`, the phase stays `build`, and history records the limit as the cause

### Requirement: Milestones link to their work
Each milestone SHALL have a title, a status of `planned`, `approved`, `running`, `verifying`, `done` or `parked`, an optional plan, links to the Orchestrator Workflow or Room that delivers it, and the evidence that closed it. A dispatch link SHALL also record when its work was last observed reporting and, when a project pause disarmed the dispatched Workflow's triggers, which triggers it disarmed. A milestone MUST NOT be `done` without evidence accepted by the verification gate.

#### Scenario: Milestone shows its dispatch
- **WHEN** the Architect dispatches a Workflow for a milestone
- **THEN** the milestone records the Workflow id and workspace so the UI can link to the Orchestrator record

#### Scenario: A report is observed
- **WHEN** the runtime observes the dispatched Workflow report while it is running
- **THEN** the dispatch link records that observation and its time

#### Scenario: Pause disarms and resume restores
- **WHEN** a project pause disarms two of the maintenance Workflow's three triggers, the third having already been off
- **THEN** the dispatch link records those two trigger ids, and resume re-arms those two only

### Requirement: Single writer and restart recovery
Only the Architect runtime SHALL write a project record. Every write MUST be atomic. After a restart, the runtime MUST reconcile every project before any owner session is woken: re-check the budget, re-read the linked Orchestrator index files, and hold rather than resume any project whose state cannot be confirmed.

#### Scenario: Restart with an over-budget project
- **WHEN** Sero restarts and a project used its cap while Sero was closed
- **THEN** the project comes back with the `limited` overlay and its owner session is not woken

#### Scenario: Interrupted write
- **WHEN** a write to a project record is interrupted
- **THEN** the previous complete record remains readable and no partial record is loaded

### Requirement: Records survive the plugin being disabled
When the Architect plugin is disabled by the `SERO_ARCHITECT` environment variable, existing project records and their index MUST be kept unchanged, and no owner session may be woken.

#### Scenario: Plugin disabled then enabled
- **WHEN** the user sets `SERO_ARCHITECT=0`, restarts, later removes it and restarts again
- **THEN** every project appears with the state it had before, and reconciliation runs before any wake

### Requirement: The index carries a derived activity, not written prose

Each index entry SHALL carry an activity derived from the project record and the watched Orchestrator indexes: a state from the shared activity vocabulary, the work it refers to, whose work it is, the action needed from the user if any, and the time of the last saved report. The Architect's own written sentence SHALL remain on the project record for the project page and MUST NOT be the source of an index entry's state.

#### Scenario: The model writes a stale sentence

- **WHEN** the Architect's last written sentence says it is working but no run has reported
- **THEN** the index entry's state is derived as `last-known` and the written sentence is not used as the state

#### Scenario: Whose work it is

- **WHEN** a milestone is running in a Room while the owner takes no turn
- **THEN** the entry names the Room as the owner of the work and records the Architect as idle

### Requirement: Liveness is observed, never assumed

The runtime SHALL mark a dispatch live only while it is running and has itself observed that run report through the watched Orchestrator index. On start, the runtime MUST treat every saved liveness mark from an earlier session as not live until it observes a report again. The index SHALL record whether the runtime is running, so a reader can tell a missing report from a stopped runtime.

#### Scenario: Restart clears stale liveness

- **WHEN** Sero restarts with a dispatch that was live before the restart and nothing reports afterwards
- **THEN** the dispatch is not live and the entry reads `last-known` with the saved report time

#### Scenario: Runtime disabled

- **WHEN** the Architect runtime is disabled by its environment switch
- **THEN** the index records that the runtime is not running, and no entry claims live work

### Requirement: A block on delegated work records what it was and why

When the Architect blocks a project because delegated work ended without reporting, the record SHALL hold that block as named fields: what the work was called, what state it ended in, when it ended, and the cause if one is known. A block MUST NOT be stored only as a sentence that a reader has to parse to recover those facts. Where the runtime already holds the work's title at the moment it blocks, that title MUST be saved rather than discarded.

#### Scenario: A research Room is cancelled

- **WHEN** a research Room the Architect is waiting on reaches a cancelled state
- **THEN** the record holds the Room's title, that it was cancelled, the time, and the cause if one is known
- **AND** a reader can name the Room without reading the project's history

#### Scenario: An earlier cause is linked

- **WHEN** that Room had already raised a decision about the access its members needed
- **THEN** the saved cause refers to that decision, so the page can state the reason it recorded

#### Scenario: No cause is known

- **WHEN** delegated work ends in a state with no recorded cause
- **THEN** the record holds the work, its state and the time, and no cause
- **AND** no cause is inferred from a count of earlier attempts

### Requirement: A planning attempt is not a report of the work stopping

A count of attempts to plan delegated work SHALL NOT be presented, or stored in a field named, as a count of times the work itself stopped. Where both are worth keeping, they MUST be separate fields.

#### Scenario: Planning was retried

- **WHEN** planning a research Room was interrupted twice before the Room existed
- **THEN** that count describes planning attempts, and nothing claims the Room stopped twice

### Requirement: A milestone records why its delegated work stopped

A milestone's dispatch SHALL record why the delegated work stopped, taken from that
work's own record, and SHALL record which steps were in flight when a restart
interrupted it. Where the work's own record retains no cause, the dispatch SHALL
record no cause rather than a sentence written without one, and the dispatch MUST
still be recognisable as stopped.

#### Scenario: A Workflow that reached its limit

- **WHEN** a dispatched Workflow stops at its cost or time limit
- **THEN** the milestone records the limit's own reason text

#### Scenario: A Workflow a restart interrupted

- **WHEN** a dispatched Workflow is interrupted by a restart
- **THEN** the milestone records that the work was interrupted and which steps were in flight

#### Scenario: No cause retained

- **WHEN** the delegated work's own record retains no cause
- **THEN** the milestone records no cause and stays recognisable as stopped, so the page states that without inventing one and the work remains recoverable

### Requirement: A history entry records what it is about

A project's history entry SHALL record what the entry is about, when the entry
concerns a milestone, a Workflow, a Room or a decision. The record SHALL hold the
subject's kind, the subject's id, and the name the writer held for the subject. The
entry SHALL keep any long note, question or reason it carries apart from the short
cause it shows as its headline, so a reader shows the headline and folds the note.
An entry that records no subject SHALL remain readable, and its cause SHALL be
shown as it was written.

#### Scenario: A dispatched milestone

- **WHEN** a milestone is dispatched to a Workflow or a Room
- **THEN** the entry records the milestone's name, the kind of work it went to, and that work's id

#### Scenario: An accepted milestone

- **WHEN** a milestone is accepted on passed evidence
- **THEN** the entry names the milestone and what it was accepted on

#### Scenario: A decision

- **WHEN** a decision is raised or answered
- **THEN** the entry records the decision's id and the name the writer held for it

#### Scenario: An entry with a long note

- **WHEN** the user resumes a project with a note, or the Architect records a long reason
- **THEN** the entry carries the note apart from its headline, so a reader shows the headline and folds the note

#### Scenario: An entry written earlier

- **WHEN** an entry written before this requirement is read
- **THEN** it loads with no subject and no note, and its cause is shown as it was written

### Requirement: A project can start on an existing workspace

Creating a project on an existing workspace SHALL record that workspace's id and path on the project record, and SHALL NOT create a workspace or register one. A workspace SHALL hold at most one Architect project.

#### Scenario: The workspace is linked, not created

- **WHEN** the user creates a project on an existing workspace
- **THEN** the record holds that workspace's id and path, and the set of registered workspaces is unchanged

#### Scenario: The workspace's own contents are unchanged

- **WHEN** a project is created on an existing workspace
- **THEN** the workspace's files and its workspace configuration are unchanged

#### Scenario: A workspace already holds a project

- **WHEN** a workspace already holds an Architect project and a second project is created on it
- **THEN** the creation is refused and no second record is written
