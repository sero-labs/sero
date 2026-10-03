## MODIFIED Requirements

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

## ADDED Requirements

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
