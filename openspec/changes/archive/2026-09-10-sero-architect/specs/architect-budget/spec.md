## Purpose

The project budget bounds what the Architect may start on the user's behalf, so an autonomous project cannot run up unbounded cost.

## ADDED Requirements

### Requirement: Cap set at the charter
Every charter SHALL propose a cost cap in USD, and the user's approval of the charter approves the cap. The user MAY raise or lower the cap at any time from the project page. A project MUST NOT enter `build` without an approved cap.

#### Scenario: Charter without a cap
- **WHEN** the owner submits a charter with no cost cap
- **THEN** the charter is refused and the owner is told the cap is required

### Requirement: Usage is charged from every source
The project SHALL charge to its usage the cost of every owner-session turn, every subagent run the owner starts, and the reported usage of every linked Workflow and Room as their index views change. Charging MUST happen before any budget check.

#### Scenario: Room usage rises
- **WHEN** a linked Room's reported cost increases
- **THEN** the project's usage increases by the same amount on the next index change

### Requirement: Reaching the cap stops new work
When usage reaches the cap, the project MUST take the `limited` overlay, the owner MUST NOT be woken for anything except a directive, and no new dispatch may start. In-flight Workflows and Rooms continue under their own limits. The user sees the reached cap on the project page and the widget.

#### Scenario: Cap reached mid-build
- **WHEN** usage reaches the cap while a Workflow is running
- **THEN** the Workflow continues, no further milestone is dispatched, and the project shows `limited`

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
