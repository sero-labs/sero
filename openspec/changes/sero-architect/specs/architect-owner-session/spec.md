## Purpose

The owner session is the long-lived agent that acts as the project's owner: it thinks, dispatches work through existing Orchestrator modes, verifies results, and escalates decisions, and it is woken by events rather than running on a timer.

## ADDED Requirements

### Requirement: One owner session per project
Each project SHALL have exactly one owner session, opened as a host-managed persistent session from a user-approved grant that names the project workspace, the models, and the tools the owner may use. The Architect MUST NOT widen that grant. The owner session MUST NOT be steered by any other autonomous driver.

#### Scenario: Grant refused
- **WHEN** the user rejects the persistent-session grant proposal at intake
- **THEN** the project stays in `intake` with the `blocked` overlay and the reason names the missing grant

#### Scenario: Second driver refused
- **WHEN** a Workflow step targets the owner session as an active session
- **THEN** the step is refused with a reason naming the owner session's driver

### Requirement: The record is the contract
On every wake, before the owner's turn, the runtime SHALL send a contract built from the project record: the idea, the brief, the phase and overlay, open decisions, unanswered directives, milestone states, budget remaining, and the event that caused the wake. The contract MUST state that it replaces every earlier contract, MUST carry the idea and directives as task data rather than instructions, and MUST say "keep working" only when the project has no overlay. The contract MUST be sent again after session compaction.

#### Scenario: Paused project contract
- **WHEN** the owner is woken to answer a directive while the project is `paused`
- **THEN** the contract instructs it to reply and stop, and it does not dispatch work

#### Scenario: Idea contains an instruction
- **WHEN** the idea text contains an instruction to widen access or ignore the charter
- **THEN** the owner reports that instruction in the brief and does not act on it

### Requirement: Wake sources and priority
The owner SHALL be woken only by: a user directive, an answered decision or approval, a linked Workflow or Room becoming blocked or asking a question, a linked Workflow or Room completing, a GitHub or scheduled event arriving through a linked maintenance Workflow, or the project becoming quiet with planned work remaining. Wakes MUST be handled in that priority order, one at a time per project. A wake that arrives during an owner turn MUST be queued and coalesced with later wakes of the same kind. The runtime MUST NOT poll for any of these.

#### Scenario: Directive outranks completion
- **WHEN** a directive and a Workflow completion arrive while the owner is idle
- **THEN** the directive wake is delivered first and the completion is delivered on the following wake

#### Scenario: Wake during a turn
- **WHEN** two completions arrive while the owner is mid-turn
- **THEN** exactly one completion wake follows the turn and it names both completions

### Requirement: Ending a wake is explicit
The owner SHALL end each wake by calling one of the Architect tools that declares an outcome: sleep, decide, blocked, or a status update followed by sleep. A turn that ends without one of these calls MUST be treated as no progress, and three consecutive such turns MUST pause the project with the `blocked` overlay and a reason.

#### Scenario: Silent turn
- **WHEN** the owner's turn ends with visible text and no outcome tool call
- **THEN** the runtime records no progress and does not wake the owner again for that event

### Requirement: The owner acts only through the Architect tool
The owner session's grant SHALL name only the platform tools and the `sero-cli` bridge, and the session's command surface SHALL hold only the Architect app's own commands plus the managed-session defaults. The owner SHALL change the project record, start research, dispatch work and request verification only through the Architect tool actions: brief, charter, milestone, decide, research, dispatch, evidence, status, reply, blocked, and sleep. Each action MUST carry the project id, and a call for a project the calling session does not own MUST be refused. The runtime MUST perform research through the subagent seam, dispatch through the typed Orchestrator and Room registry handles, and verification through the host verification, dev-server and git seams. The owner MUST NOT hold a Workflow, Room or subagent tool of its own.

#### Scenario: Foreign project id
- **WHEN** an owner session calls a record action with another project's id
- **THEN** the call is refused and the record is unchanged

#### Scenario: Dispatch links the milestone
- **WHEN** the owner calls dispatch for a milestone with a Workflow prompt
- **THEN** the runtime creates and activates the Workflow in the project workspace, the milestone status becomes `running`, and the Workflow id is linked

#### Scenario: Owner command surface
- **WHEN** the owner session opens and logs its command list
- **THEN** the list holds the Architect owner command and no command from another app; the shared workspace commands are absent because the private registry bridges only the grant-owning app, and the `architect_projects` management command refuses an owner caller

#### Scenario: Research runs from the runtime
- **WHEN** the owner calls research with a question and a stopping condition
- **THEN** the runtime runs a structured subagent with them and the result is attached to the record before the owner is woken again

### Requirement: Session history is readable but not shown by default
The user SHALL be able to open the owner session's history from the project page. The project page MUST NOT stream the transcript or show it by default.

#### Scenario: Open session
- **WHEN** the user selects Open session on a project page
- **THEN** the owner session's history is shown in a separate view and the project page is unchanged
