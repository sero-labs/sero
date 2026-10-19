# Spec Delta

## MODIFIED Requirements

### Requirement: Wake sources and priority

The owner SHALL be woken only by: a user directive, an answered decision or approval, linked execution becoming blocked or asking a question, linked execution completing, a registered observable wait being satisfied, a GitHub or scheduled event arriving through a linked maintenance Workflow, or the project becoming quiet with eligible planned or continuous work remaining. Wakes MUST prioritize directives and approvals over work events and handle work events before quiet continuation, one at a time per project. A wake that arrives during an owner turn MUST be queued and coalesced with later wakes of the same kind. The owner scheduler MUST remain event-driven and MUST NOT poll for these wake sources. External CI source adapters MAY retain bounded polling and notify the scheduler when a registered condition is satisfied. Registered waits SHALL obey their durable consumption and current-control rules; continuous work MUST NOT acquire a second autonomous session driver.

#### Scenario: Directive outranks completion
- **WHEN** a directive and a Workflow completion arrive while the owner is idle
- **THEN** the directive wake is delivered first and the completion is delivered on the following wake

#### Scenario: Wake during a turn
- **WHEN** two completions arrive while the owner is mid-turn
- **THEN** exactly one completion wake follows the turn and it names both completions

#### Scenario: Direct continuation and a user instruction race
- **WHEN** a continuous execution is eligible to continue and a new directive arrives
- **THEN** the current directive is handled before further autonomous work
- **AND** only the existing owner driver can start its next turn

#### Scenario: A CI adapter polls a registered condition
- **WHEN** an external CI adapter observes a matching result through bounded polling
- **THEN** it notifies the event-driven owner scheduler under the registered wait's consumption and current-control rules
- **AND** polling does not start owner turns while the condition remains unmet

### Requirement: Ending a wake is explicit

The owner SHALL end each wake through an Architect outcome action: sleep, decide, blocked, a status update followed by sleep, continue eligible direct work, or register an observable wait. A turn that ends without an outcome MUST be treated as no progress, and three consecutive such turns MUST pause the project with the `blocked` overlay and a reason. A continuation request MUST NOT itself prove progress, completion or authority to start another paid turn.

#### Scenario: Silent turn
- **WHEN** the owner's turn ends with visible text and no outcome tool call
- **THEN** the runtime records no progress and does not wake the owner again for that event

#### Scenario: Explicit continuation
- **WHEN** the owner records that its current execution needs another turn
- **THEN** the scheduler considers continuation under current authority, budget and controls without requiring delegation

#### Scenario: A wait is acknowledged
- **WHEN** the owner registers a supported observable wait
- **THEN** the wake ends with that durable wait rather than being counted as a silent no-progress turn
