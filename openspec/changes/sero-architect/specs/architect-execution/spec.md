## Purpose

Architect delegates bounded project work through existing Sero execution modes and retains correct authority, accounting, direction, and recovery across those executions.

## ADDED Requirements

### Requirement: Delegate bounded work through existing modes

Architect SHALL be able to assign work to focused agent sessions, Workflows, Rooms, and supported Goal-driven sessions. Each assignment SHALL identify its objective, relevant project revision, workspace, constraints, expected result and evidence, and return destination. Existing modes SHALL remain independently usable.

#### Scenario: Architect starts a bounded execution
- **WHEN** the next project action requires delegated work
- **THEN** Architect selects a suitable available mode and records the resulting execution against that work
- **AND** the project remains owned after the execution finishes

#### Scenario: A mode is unavailable
- **WHEN** a selected mode cannot run in the current environment
- **THEN** Architect uses a suitable authorized alternative or reports the dependency
- **AND** it does not claim the work started

### Requirement: Use the worker's effective capabilities

The system SHALL resolve capabilities from actual installation, loaded resources, current grant, workspace runtime, and provider availability. Discovery SHALL distinguish available capabilities from unavailable ones. The system MUST NOT widen authority by exposing another session's tools, shared registry, credentials, or workspace access.

#### Scenario: A plugin exists in chat but is unavailable to a worker
- **WHEN** Architect proposes work requiring that plugin
- **THEN** the system identifies the missing worker capability before dispatch
- **AND** it either establishes access through the supported authorization path or keeps that work blocked

#### Scenario: A selected runtime is unavailable
- **WHEN** the authorized workspace runtime cannot start
- **THEN** Architect reports that limitation and does not silently execute the task on Host

#### Scenario: A running team needs a broader grant
- **WHEN** an assignment needs a member or capability outside the running team's grant
- **THEN** the system uses a supported grant and handover path or reports the limitation
- **AND** an Architect instruction alone does not expand the grant

### Requirement: Prevent conflicting ownership and duplicate starts

The system SHALL allow only one active project owner per project and one autonomous driver per driven session. A repeated dispatch request SHALL resolve to the same logical work or remain pending reconciliation. It MUST NOT start a duplicate solely because an acknowledgement was lost.

#### Scenario: Dispatch acknowledgement is interrupted
- **WHEN** an executor starts work but the project owner does not receive the acknowledgement
- **THEN** recovery locates that work or holds the dispatch as uncertain before another start is allowed

#### Scenario: A chat session already has an autonomous driver
- **WHEN** Architect requests another autonomous driver for that session
- **THEN** the request is refused with a reason and the existing driver continues under its existing authority

### Requirement: Reconcile active work with new direction

The system SHALL identify work affected by an applied project revision, prevent obsolete new dispatches, and steer or settle affected running work through supported executor controls. It SHALL retain useful results. An old-revision result MUST NOT count as accepted current work until reviewed against current requirements.

#### Scenario: A worker returns after a priority change
- **WHEN** a result arrives for an assignment affected by newer user direction
- **THEN** Architect identifies its old revision and decides whether to reuse, revise, or retain it only as history
- **AND** the result does not automatically advance the current milestone

#### Scenario: Parallel work is unaffected
- **WHEN** the user redirects one assignment and another assignment remains valid
- **THEN** the valid assignment can continue within the current authority and budget

### Requirement: Enforce shared project budgets

The system SHALL account for owner work, delegated work, and observable external-service usage under the project's established budget. Concurrent dispatches SHALL reserve bounded allocations without spending the same available allocation twice. Unknown usage SHALL remain visible as unknown. Limit exhaustion MUST NOT be reported as completion.

#### Scenario: Concurrent work would exceed the remaining allocation
- **WHEN** the available project allocation cannot cover both proposed bounded executions
- **THEN** the system defers or narrows work within the established limits or requests a budget change
- **AND** Architect cannot raise its own budget

#### Scenario: Usage arrives again after recovery
- **WHEN** the same execution usage is observed more than once
- **THEN** it is counted once against the project

#### Scenario: Usage is incomplete
- **WHEN** an external service has not supplied final usage
- **THEN** the system identifies the missing usage and does not present a known subtotal as an exact total

### Requirement: Wake on relevant changes and recover from interruption

Architect SHALL wake for relevant user input, execution outcomes, resolved decisions, subscribed events, or bounded timers. It SHALL retain pending work across restart and reconcile it before new dispatch. Waiting without a relevant change MUST NOT consume repeated model turns for status checks. Uncertain external effects MUST NOT be repeated without reconciliation.

#### Scenario: Sero restarts during work
- **WHEN** a project has an interrupted owner or child execution
- **THEN** Sero reconciles durable execution and project records, restores current owner context, and continues only work whose next action is established

#### Scenario: A relevant event is delivered twice
- **WHEN** the same event reaches the project more than once
- **THEN** it produces one logical pending action or attaches to existing work

#### Scenario: The project waits for a person
- **WHEN** required user input has not arrived and no other useful action is available
- **THEN** Architect waits without repeatedly calling a model to restate the question

### Requirement: Preserve existing state and work during disablement

Disabling Architect SHALL stop new project dispatch and reconcile active child work without deleting project records, transcripts, artifacts, or uncommitted changes. It MUST NOT rewrite unrelated execution-mode state.

#### Scenario: Architect is disabled while a child has changes
- **WHEN** the feature is disabled with active project work
- **THEN** the system settles or reports active work, preserves its files and records, and leaves independent Workflows, Rooms, Goals, and chats under their existing controls
