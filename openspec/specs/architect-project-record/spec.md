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

The existing phase values `intake`, `discovery`, `charter`, `build`, `release` and `maintain` SHALL remain readable as compatibility/status fields, not a prescribed route for new projects. A project SHALL carry at most one overlay: `decision`, `blocked`, `paused`, or `limited`. Recorded phase changes MUST retain their cause and timestamp. For new agreements, approved user intent and execution authority SHALL govern work; phase values MUST NOT force research, a charter, a team, a step sequence or a new approval. Architect SHALL form and revise its working route just in time. A project without an agreement MUST retain its legacy charter approval gate. No phase transition SHALL confer new authority.

#### Scenario: Authorized direct build
- **WHEN** a new project has an approved delivery agreement and Architect has enough context to build
- **THEN** it can move from intake to build without a research phase or another charter approval
- **AND** history records that transition and the agreement that authorized it

#### Scenario: Charter approval gates build
- **WHEN** an existing project has no delivery agreement and its charter is unapproved
- **THEN** no milestone work is dispatched and the charter remains unapproved

#### Scenario: Limit is not progress
- **WHEN** the project reaches its cost cap during build
- **THEN** the overlay becomes limited, the phase stays build and history records the limit as the cause

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

Each project index entry SHALL carry bounded derived activity: shared state, current work and its owner, next needed action, available spend/limit facts and last saved meaningful activity. Scoped metadata updates SHALL provide current-session contact freshness without requiring full-record or transcript reads. The owner's written sentence MUST NOT determine state or contact. Concurrent work SHALL be represented without substituting the last received worker event for the whole project.

#### Scenario: The model writes a stale sentence
- **WHEN** the latest owner sentence says it is working but no attached run has reported
- **THEN** the activity is Last known rather than derived from that sentence

#### Scenario: Whose work it is
- **WHEN** a Room is working while the owner is idle
- **THEN** the entry names the Room as the current worker and does not label the owner as executing

### Requirement: Liveness is observed, never assumed

The runtime SHALL mark work live only from current-session observations confirming an attached owner, researcher or delegated run. Reports SHALL come from the actual producing runtime through scoped observation, not only final record/index saves. Startup MUST clear saved live marks until a producer is confirmed again. The index SHALL identify whether the Architect runtime is running. A contact update MUST NOT rewrite saved meaningful-activity timestamps.

#### Scenario: Restart clears stale liveness
- **WHEN** Sero restarts with earlier live marks but no producer confirmed in the new session
- **THEN** the work reads Last known with the earlier real activity time

#### Scenario: Runtime disabled
- **WHEN** the Architect runtime is disabled
- **THEN** the index identifies that it is not running and no entry claims fresh live work

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

### Requirement: Delivery intent and approval are durable

The record SHALL retain the user's request and later instructions verbatim, their stated constraints, the workspace, cost/start cap, approved access/actions and approval revision/time. It SHALL keep Architect's evolving interpretation, assumptions, working plan and acceptance criteria separate from those user facts. No product field, required selector, enum or inferred label SHALL classify a solution into preset quality/readiness categories or select its workflow. The agreement MUST NOT require a fully designed solution before paid work can start. Agent-authored working updates MUST NOT rewrite user intent or spending/access authority. Existing records MUST NOT acquire approval or increased autonomy on load. A record without an agreement SHALL keep its saved charter gates and is read as-is; the product SHALL NOT add an upgrade or adoption path for it.

#### Scenario: Approach changes while intent stays
- **WHEN** new findings cause Architect to replace its initial implementation approach
- **THEN** the record retains the original request and authority while recording the revised working approach and its reason
- **AND** no solution-category change or charter approval is needed merely to revise that approach

#### Scenario: A requested outcome cannot be met
- **WHEN** Architect determines that a user-stated requirement cannot be met within the approved limits
- **THEN** it records the actual gap and necessary decision rather than silently relaxing the request or relabelling the solution

#### Scenario: Existing MiniSynth project loads
- **WHEN** the existing MiniSynth project and completed research Room load after upgrade
- **THEN** their identifiers, saved work, spend, $5 proposed cap, unanswered approvals and evidence remain unchanged
- **AND** the project continues on its saved charter flow, which the UI identifies as deprecated, with no adoption action and no record rewrite

### Requirement: Overview summaries are separate from working documents

The record SHALL keep bounded user-facing outcome, current objective, result and decision summaries separate from full plans, research and evidence. Every summary SHALL retain links to its source work. Execution state and observation freshness MUST be derived from runtime facts, not summary prose. Content that exceeds a summary field's declared limit MUST be returned to its author for revision rather than silently cut, rewritten into a different meaning or treated as authorization.

#### Scenario: Long design brief
- **WHEN** a research result contains a long technical design
- **THEN** the result remains accessible in work detail and does not become the project's overview summary

#### Scenario: Summary omits a required choice
- **WHEN** a product choice still needs the user
- **THEN** that choice remains an explicit decision even if a summary says work can proceed
