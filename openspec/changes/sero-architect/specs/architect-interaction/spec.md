## Purpose

Architect gives the user a clear current picture of a project and a continuing way to direct it, while keeping routine execution detail in existing Orchestrator views.

## ADDED Requirements

### Requirement: Support an ongoing two-way conversation

The user SHALL be able to ask questions, challenge decisions, and direct Architect throughout the project, including while work is active. Architect SHALL distinguish explanation requests from direction changes. It SHALL ask for clarification when ambiguity could materially change the work.

#### Scenario: The user asks why
- **WHEN** the user asks why Architect chose an approach
- **THEN** Architect explains the relevant reason and evidence
- **AND** it does not change direction solely because the user asked for an explanation

#### Scenario: The user redirects the project
- **WHEN** the user gives a clear new priority or constraint
- **THEN** Architect records the direction and explains its effect on the project and affected work
- **AND** a conflict with prior requirements or feasibility is made explicit

### Requirement: Acknowledge the actual application of direction

The system SHALL retain user direction durably before confirming receipt. It SHALL distinguish receipt from completed application when affected work is still settling. It MUST NOT report a direction as applied while continuing affected work under an obsolete instruction without explanation.

#### Scenario: Work cannot change immediately
- **WHEN** active work must reach a supported stopping point before new direction takes effect
- **THEN** Architect explains that the direction is being applied and what remains in progress
- **AND** it confirms the result after affected assignments and plan state are reconciled

#### Scenario: Direction cannot be recorded
- **WHEN** saving the user's direction fails
- **THEN** the interface reports that it has not been saved
- **AND** Architect does not claim that the change was applied

### Requirement: Provide explicit pause resume and stop

The user SHALL be able to pause, resume, or stop project work without relying on natural-language interpretation. Pausing SHALL prevent new dispatch immediately and show whether active work is still settling. Resume SHALL reconcile current state before continuing. Stop SHALL request cancellation and preserve results and uncertain external effects.

#### Scenario: The user pauses active work
- **WHEN** the user selects pause while a worker is running
- **THEN** no new project work starts and the worker receives the supported pause or settlement request
- **AND** the interface does not show fully paused until active work has settled

#### Scenario: The user resumes after changing direction
- **WHEN** the user resumes a paused project with newer instructions
- **THEN** Architect reconciles the changed plan and existing results before dispatching work

#### Scenario: The user stops during delivery
- **WHEN** stop occurs while an external operation is unresolved
- **THEN** Architect reports the uncertain effect and does not imply that cancellation reversed a completed action

### Requirement: Ask for consequential input with useful context

Architect SHALL raise input requests when human judgment or additional authority is needed. Each request SHALL state the issue, reason, recommendation when available, consequence, and affected work. Delegated choices SHALL proceed without compulsory approval. Unaffected authorized work SHALL remain able to continue.

#### Scenario: A decision blocks only part of the project
- **WHEN** one workstream requires a user decision and another can proceed
- **THEN** the request identifies the blocked work and the interface accurately shows the continuing work

#### Scenario: A question has already been answered
- **WHEN** a later execution needs an answer recorded in the current project
- **THEN** Architect uses that answer rather than requiring the user to repeat it

### Requirement: Show a minimal and truthful current view

The main Architect view SHALL make the current project state, required input, useful available result, and a way to direct Architect clear. It SHALL show information when it requires action, supports review, explains a material change or limitation, or confirms direction. It MUST NOT display a routine event feed or granular agent activity by default.

#### Scenario: Routine work progresses
- **WHEN** tools complete, workers exchange messages, or an automatic retry occurs without a material effect
- **THEN** the current explanation updates where needed without appending routine events to the main conversation

#### Scenario: A material limitation occurs
- **WHEN** the project is blocked, required verification is missing, a budget needs attention, or delivery fails
- **THEN** the main view shows the limitation and required input or next action
- **AND** a positive agent summary cannot hide that state

#### Scenario: No input or result is available
- **WHEN** Architect is working and has no required input or useful result to show
- **THEN** the view remains compact without empty decision or result sections

### Requirement: Reveal detail on demand

The user SHALL be able to inspect relevant history, evidence, and execution detail on demand. Architect SHALL link to the specific existing execution or artifact view when available and retain a clear return to the project. Detail navigation MUST NOT change project state by itself.

#### Scenario: The user investigates a blocked Room
- **WHEN** the user opens the Room detail linked from Architect
- **THEN** the relevant Room and its granular state are available without requiring Architect to duplicate that view

#### Scenario: The user reviews an earlier conversation
- **WHEN** the user requests project conversation history
- **THEN** the history is available without making all history the default project view

### Requirement: Review the interaction before production implementation

The change SHALL provide an interactive Sero-style prototype early and obtain explicit user approval of its direction before production implementation. The prototype SHALL demonstrate state, direction, decisions, pause/resume, result review, and detail access using illustrative data. Build or automated check success MUST NOT substitute for user approval.

#### Scenario: The prototype passes automated checks
- **WHEN** the prototype works with mouse and keyboard, passes its build and accessibility checks, and is reviewed at two desktop sizes
- **THEN** it is presented for user review
- **AND** production implementation remains gated until the user approves the direction

#### Scenario: Prototype data suggests a product design
- **WHEN** a prototype shows example project content
- **THEN** that content remains illustrative and is not added to the live trial's seed requirements
