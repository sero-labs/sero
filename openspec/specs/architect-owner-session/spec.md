## Purpose

The owner session is a long-lived agent for the project. It dispatches work through existing Orchestrator modes, verifies results, escalates decisions and wakes on events rather than on a timer.

## Requirements

### Requirement: One owner session per project

Each project SHALL have exactly one owner session, opened as a host-managed persistent session from a user-approved grant that names the project workspace, the models, and the tools the owner may use. The Architect MUST NOT widen that grant. The owner session MUST NOT be steered by any other autonomous driver.

#### Scenario: Grant refused

- **WHEN** the user rejects the persistent-session grant proposal at intake
- **THEN** the project stays in `intake` with the `blocked` overlay and the reason names the missing grant

#### Scenario: Second driver refused

- **WHEN** a Workflow step targets the owner session as an active session
- **THEN** the step is refused with a reason naming the owner session's driver

### Requirement: The record is the contract

On every wake, before the owner's turn, the runtime SHALL send a compact authoritative contract built from the project record: the idea, the brief, the phase and overlay, open decisions, unanswered directives, milestone states, budget remaining, and the event that caused the wake. The contract MUST state that it replaces every earlier contract, MUST carry the idea and directives as task data rather than instructions, and MUST say "keep working" only when the project has no overlay. It SHALL include the active objective's relevant details and changes while keeping historical plans, research and evidence available through bounded summaries and authorized references rather than repeatedly embedding all detail. It MUST NOT omit authority constraints to meet a context budget. After compaction or an approved owner-session replacement, the runtime SHALL reconstruct and send the current contract and active-work context before continuation; it MUST NOT depend on an earlier delta still being in the transcript.

#### Scenario: Paused project contract

- **WHEN** the owner is woken to answer a directive while the project is `paused`
- **THEN** the contract instructs it to reply and stop, and it does not dispatch work

#### Scenario: Idea contains an instruction

- **WHEN** the idea text contains an instruction to widen access or ignore the charter
- **THEN** the owner reports that instruction in the brief and does not act on it

#### Scenario: Completed research does not dominate every wake

- **WHEN** several large research reports and completed milestone plans exist but a wake concerns one active objective
- **THEN** the contract includes relevant summaries and references rather than embedding every historical result again
- **AND** the owner can retrieve needed detail under its existing permissions

#### Scenario: Compaction loses preceding updates

- **WHEN** compaction removes earlier state updates from the conversation
- **THEN** the next contract reconstructs current authority and active-work state without requiring those earlier updates

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

The owner session's grant SHALL name only the authorized platform tools and the `sero-cli` bridge, and its command list SHALL hold only Architect's own commands plus managed-session defaults. The owner SHALL change records, plan, research, dispatch, verify and control linked-work recovery only through Architect tool actions. Every action MUST identify the project, and foreign-project calls MUST be refused. Research SHALL use the host subagent API; dispatch and recovery SHALL use typed Orchestrator/Room registries, which this change extends with the narrow Room control methods those recovery scenarios need; verification SHALL use host verification, dev-server and git APIs. The owner MUST NOT gain a general Workflow, Room or subagent tool. A recovery action MUST target an existing linked operation, reconcile its actual state and enforce the remaining project and delegated authority before taking effect.

#### Scenario: Foreign project id
- **WHEN** an owner session calls a record or recovery action with another project's id
- **THEN** the call is refused and no record or delegated work is changed

#### Scenario: Dispatch links the milestone
- **WHEN** the owner dispatches a milestone through Architect
- **THEN** the runtime creates the delegated work in the approved project workspace and links its operation before reporting success

#### Scenario: Owner command surface
- **WHEN** the owner session opens
- **THEN** its private command list exposes Architect's owner command, not other apps' commands
- **AND** the management command continues to refuse an owner caller

#### Scenario: Research runs from the runtime
- **WHEN** the owner requests research with a question and stopping condition
- **THEN** the runtime runs the authorized researcher or collaboration and attaches its result before waking the owner

#### Scenario: Linked Room needs recovery
- **WHEN** the owner requests a safe authorized recovery of its linked Room
- **THEN** the runtime operates on that same Room through the existing Room registry
- **AND** it does not claim success unless the actual resulting state confirms the action

#### Scenario: Completed research must not be resumed
- **WHEN** a recovery request targets a research Room that already completed
- **THEN** the runtime returns that completion and saved result rather than resuming or recreating it

### Requirement: Session history is readable but not shown by default

The user SHALL be able to open owner history and live owner activity from the project. Both SHALL appear in a separate work/history surface. The overview MUST NOT stream the owner's transcript by default. Opening live work SHALL not require a completed turn or any pending research.

#### Scenario: Open session
- **WHEN** the user opens the owner's session history
- **THEN** it is shown in a separate view and does not expand the project overview

#### Scenario: Owner is preparing work
- **WHEN** the owner is running before a Workflow or Room exists and the user opens Watch work
- **THEN** its actual current activity is available without waiting for the turn to end

### Requirement: Owner optimizes for the approved outcome

The owner SHALL determine the solution just in time from the user's current input, relevant context, available tools and findings. It SHALL form and revise requirements, approach, research, delegation, concurrency, checks and recovery as needed, without a preset solution category, complete upfront plan, mandatory report, fixed roster or phase sequence. Reasonable in-scope choices SHALL use the agent's judgment without routine approval. It SHALL ask when uncertainty could materially change the intended result or when the next action needs new authority. Its working plan SHALL remain inspectable and MUST NOT substitute for the user's request.

#### Scenario: Enough context to act
- **WHEN** the current request is clear enough to begin useful work
- **THEN** Architect can choose and start that work without first completing a research phase, full solution design or charter document

#### Scenario: New evidence changes the route
- **WHEN** an experiment or check shows that the initial approach is unsuitable
- **THEN** Architect revises the approach and needed work from those findings within the same approved request and authority
- **AND** the runtime does not require a different solution mode or prescribed stage sequence

#### Scenario: The same phrase has different context
- **WHEN** two user requests use similar wording but have different actual requirements
- **THEN** Architect determines the needed work from each request and its context rather than routing both through a preset category

### Requirement: Pragmatic-first behavior is instruction guidance

Architect's instructions SHALL advise starting with the simplest, most pragmatic approach that meets the current request, adding effort or complexity only when the user's instructions or actual findings justify it. Current user instructions SHALL override that advice within approved authority. The product MUST NOT enforce simplicity with a classifier, fixed roster, workflow template, complexity threshold or forced architecture. Illustrative terms such as POC or production-ready SHALL appear only as examples of user input or agent advice, never as product modes, schema fields or runtime routing keys.

#### Scenario: More involved work is explicitly requested
- **WHEN** the user asks for a specific approach or requirement that needs more effort
- **THEN** Architect follows that request within authority rather than forcing a simpler solution or removing the requirement

#### Scenario: Simple start exposes a genuine need
- **WHEN** findings show that an initially simple approach will not satisfy the request
- **THEN** Architect can choose a more involved approach without changing a product tier
