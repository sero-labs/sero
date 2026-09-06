## Purpose

The project record is the single durable source of truth for one Sero Architect project: what the user asked for, what the Architect decided, where the work stands, and what the user must answer.

## ADDED Requirements

### Requirement: One durable record per project
The system SHALL keep one project record per Architect project under the active profile, with a watched index that lists every project. The record MUST contain the user's idea verbatim, the Architect's brief, the linked workspace, the phase, the milestones, the decisions, the directives, the dispatch ledger, the budget and usage, and a history of transitions with their causes. The record MUST be JSON-serialisable.

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
Each milestone SHALL have a title, a status of `planned`, `approved`, `running`, `verifying`, `done` or `parked`, an optional plan, links to the Orchestrator Workflow or Room that delivers it, and the evidence that closed it. A milestone MUST NOT be `done` without evidence accepted by the verification gate.

#### Scenario: Milestone shows its dispatch
- **WHEN** the Architect dispatches a Workflow for a milestone
- **THEN** the milestone records the Workflow id and workspace so the UI can link to the Orchestrator record

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
