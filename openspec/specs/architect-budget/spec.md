## Purpose

The project budget bounds what the Architect may start on the user's behalf, so an autonomous project cannot run up unbounded cost.

## Requirements

### Requirement: Cap set at the charter

New projects SHALL obtain the user's approval of a cost/start cap as part of their delivery agreement before any paid owner turn, research, planning, delegated work or verification starts. A later internal charter MUST NOT require the user to approve the same cap again. The user SHALL be able to raise or lower the cap at any time. Existing projects without a delivery agreement SHALL retain their charter cap and approval rules. Changing an internal plan MUST NOT raise the cap.

#### Scenario: No approved cap
- **WHEN** a new project has been created but its delivery agreement has not been approved
- **THEN** no paid discovery, owner turn or planning call starts

#### Scenario: Agreement approved once
- **WHEN** a user approves a delivery agreement with a $5 cap
- **THEN** research, execution, checking and repair all consume the same project budget without another cap approval within those bounds

#### Scenario: Charter without a cap
- **WHEN** an owner submits a legacy charter without a cost cap
- **THEN** it is refused and the owner is told that the cap is required

### Requirement: Usage is charged from every source
The project SHALL charge to its usage the cost of every owner-session turn, every subagent run the owner starts, and the reported usage of every linked Workflow and Room as their index views change. Charging MUST happen before any budget check.

#### Scenario: Room usage rises
- **WHEN** a linked Room's reported cost increases
- **THEN** the project's usage increases by the same amount on the next index change

### Requirement: Reaching the cap stops new work

When usage reaches the cap, the project MUST take the limited overlay and no new paid owner turn, dispatch, research, planning, repair or verification SHALL start. In-flight Workflows and Rooms SHALL continue under their existing limits and remain visible. Directives SHALL be retained and acknowledged without authorizing unpaid-for model work; a budget-blocked directive SHALL be delivered to the owner once paid continuation is authorized. The project page and widget SHALL show the reached cap and incomplete usage where applicable.

#### Scenario: Cap reached mid-build
- **WHEN** usage reaches the cap while a Workflow is running
- **THEN** the Workflow continues under its existing limits, no new paid operation starts and the project shows limited

#### Scenario: Directive at the cap
- **WHEN** the user submits a directive with no spending authority remaining
- **THEN** the directive is saved and its budget hold is visible without starting an unapproved paid owner turn

### Requirement: Raising the cap resumes
When the user raises the cap above current usage, the `limited` overlay MUST clear and the owner MUST be woken with the raise as the cause.

#### Scenario: Cap raised
- **WHEN** the user raises the cap on a `limited` project
- **THEN** the overlay clears and the owner's next contract names the new cap and remaining budget

### Requirement: A cap is a bound on starts, not a ceiling
Documentation and the project page MUST state that the cap bounds what the Architect starts and is not a guaranteed spend ceiling, because one dispatched run can spend before the next check.

#### Scenario: Copy shown
- **WHEN** the user views the budget on the project page
- **THEN** the bound-not-ceiling statement is visible

### Requirement: Autonomous planning and recovery share the remaining budget

Architect SHALL check available spending authority before starting every paid operation, including automatic recovery and supporting operations, and SHALL carry bounded spending limits into delegated work. Planning and research MUST NOT have an uncapped pre-approval allowance. Parallel work MUST NOT each be offered the full project remainder as independent spending authority. The budget SHALL continue to be described as a bound on starts, not a guaranteed final spend ceiling; in-flight spend and incomplete usage MUST remain visible.

#### Scenario: Parallel dispatches
- **WHEN** two paid tasks are started with $2 of project budget remaining
- **THEN** their allocated start budgets together do not exceed $2
- **AND** cumulative reports do not double-charge either task

#### Scenario: Recovery needs more money
- **WHEN** the next safe repair cannot start within the remaining budget
- **THEN** work is preserved and a cap decision is raised rather than increasing a delegated limit automatically
