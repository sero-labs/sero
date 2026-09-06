## Purpose

Sero Architect maintains project intent, decisions, and outstanding work from an initial idea through delivery and maintenance, across changes in sessions and execution modes.

## ADDED Requirements

### Requirement: Preserve intent and its origin

The system SHALL preserve the user's original project input verbatim. It SHALL distinguish explicit user requirements, Architect decisions, assumptions, evidence, and human decisions needed. It MUST NOT present an Architect choice as a user requirement or silently remove an explicit requirement.

#### Scenario: Architect makes a creative choice
- **WHEN** the user delegates creative choices and Architect selects a direction
- **THEN** the system records the choice as an Architect decision with its reason
- **AND** the original input remains unchanged and no additional human approval is required solely because the choice is creative

#### Scenario: A chosen approach cannot meet a user requirement
- **WHEN** Architect finds evidence that its approach conflicts with an explicit requirement
- **THEN** it changes the approach within its authority or raises the requirement conflict to the user
- **AND** it does not remove the requirement to make the plan appear complete

### Requirement: Own a project independently of its executions

The system SHALL retain project identity, current intent, decisions, plan, attention, artifacts, acceptance, and maintenance responsibilities independently of any individual session or execution. A project SHALL be able to begin before a product workspace is selected and reference multiple authorized workspaces.

#### Scenario: Work continues through a replacement session
- **WHEN** an owner session is replaced or its context is compacted
- **THEN** the owner recovers current requirements, decisions, pending direction, and outstanding work from durable project records
- **AND** it does not ask the user to reconstruct context already recorded

#### Scenario: A project uses more than one workspace
- **WHEN** the project has work in two authorized workspaces
- **THEN** both executions remain linked to the same project and retain their distinct workspace boundaries

#### Scenario: A user starts with an idea alone
- **WHEN** the user provides an idea without an existing product workspace
- **THEN** Architect can retain the idea and investigate within available authority
- **AND** workspace creation or binding uses the host's workspace authority before product work starts

### Requirement: Investigate and revise the plan from evidence

Architect SHALL be able to investigate with available tools, request bounded experiments, and revise priorities and work based on evidence. It SHALL maintain a current next action or a concrete reason for waiting. It MUST NOT require a fixed team, a fixed phase sequence, or use of every execution mode.

#### Scenario: Research changes the approach
- **WHEN** a source or experiment invalidates an assumption
- **THEN** Architect records the finding, updates affected decisions and work, and retains the reason for the change

#### Scenario: Further research has no defined purpose
- **WHEN** Architect proposes more research without an unresolved question or stopping condition
- **THEN** it must establish the question and stopping condition before starting that work

### Requirement: Keep decisions current and recoverable

The system SHALL preserve decision authorship, rationale, supporting evidence, affected work, and supersession. Architect SHALL use the current decision when assigning work. It SHALL raise a settled question again only when new evidence, changed direction, or changed authority makes it relevant.

#### Scenario: The user replaces an earlier decision
- **WHEN** the user changes a recorded decision
- **THEN** the system keeps the previous decision as superseded and uses the new decision for affected work

#### Scenario: A later session encounters old research
- **WHEN** retrieved material supports a superseded approach
- **THEN** Architect treats the current project decision as authoritative and identifies the conflict before using the old material

### Requirement: Use relevant context within project boundaries

Architect SHALL give each execution the requirements, current decisions, references, and constraints relevant to its assignment. It SHALL treat retrieved memory and graph results as supporting context rather than authority over current project records. It MUST NOT grant access to another project's content merely because a search can find it.

#### Scenario: A worker starts a bounded task
- **WHEN** Architect delegates work
- **THEN** the worker receives the current relevant context and references for deeper inspection within its access
- **AND** it does not require the full project transcript to begin

#### Scenario: Reusable memory conflicts with project intent
- **WHEN** a stored preference conflicts with an explicit current project requirement
- **THEN** Architect follows the project requirement and does not silently replace it with the preference

### Requirement: Keep profile ownership separate

Project records, owner sessions, retrieval context, and event subscriptions SHALL belong to the active Sero profile. Switching profiles SHALL preserve the inactive profile's records and prevent its project work from being adopted by the new active profile. Closing an Architect view MUST NOT itself cancel a project.

#### Scenario: The user switches profiles
- **WHEN** another profile becomes active
- **THEN** the new profile does not inherit the previous profile's project sessions, memory, pending work, or subscriptions
- **AND** returning to the original profile reconciles its records before new dispatch

#### Scenario: The user closes and reopens the view
- **WHEN** the Architect view is closed while the host remains available and later reopened
- **THEN** it shows current project state without creating another owner or cancelling existing work
