## Purpose

Define how a Workflow's lifetime spend and a Room's elapsed time are counted, so that a figure shown to the user is always the same figure the limit that stops the work enforces.

## ADDED Requirements

### Requirement: A figure on screen is the figure the limit enforces

Every surface that shows a Workflow's lifetime spend or a Room's elapsed time SHALL show the value the corresponding limit is tested against. Where a surface derives the value itself rather than reading the enforced one, the two MUST produce the same number for the same record. A surface MUST NOT show a subset of a total and label it as the total.

#### Scenario: One Workflow, one spend

- **WHEN** the same Workflow is shown on Home, in the Workflows list and on its own page
- **THEN** all three show the same spend, and that is the figure `maxCostUsd` is tested against

#### Scenario: A subset is not the total

- **WHEN** a Workflow has spent money on planning and reflection as well as on its runs
- **THEN** no surface shows only the run spend as the Workflow's spend

### Requirement: Lifetime spend counts every charge the cost limit counts

A Workflow's lifetime spend SHALL include its planning usage, its Workflow-level auxiliary usage, and every run's step attempts and auxiliary usage. Money spent outside a run, such as planning, reflection, skill extraction and revision proposals, MUST be part of that total wherever it is shown.

#### Scenario: Planning spend is included

- **WHEN** a Workflow spent money planning itself and then spent more across two runs
- **THEN** its spend on every surface is the sum of both, and its remaining budget is that sum subtracted from the cost limit

#### Scenario: Remaining budget agrees with the block

- **WHEN** a Workflow's shown spend reaches its cost limit
- **THEN** the Workflow is blocked from starting more work at that same point, not before or after it

### Requirement: A Room's elapsed time counts the time it was active

A Room's elapsed time SHALL be the time the Room has been active, accumulated across every period it ran, plus the period it is running now. It MUST NOT be the wall-clock time since the Room started. The Room's time limit SHALL be tested against that same accumulated active time.

#### Scenario: A paused Room's clock stops

- **WHEN** a Room runs for twelve minutes, is paused, and is left paused for nine days
- **THEN** its elapsed time still reads twelve minutes, and it has not reached a one-hour time limit

#### Scenario: Resuming continues the count

- **WHEN** that Room is resumed and runs for five more minutes
- **THEN** its elapsed time reads seventeen minutes

#### Scenario: A finished Room holds its figure

- **WHEN** a Room has ended
- **THEN** its elapsed time does not change again

### Requirement: A Room that predates active-time accounting keeps the time it has used

A Room whose record has no accumulated active time SHALL have it set from the time the Room started up to the point accounting begins. The Room MUST NOT be given a fresh time budget, and MUST NOT be reported as having used an unknown amount.

#### Scenario: An existing paused Room

- **WHEN** a Room that was paused before active-time accounting existed is read afterwards
- **THEN** its elapsed time is the time already recorded against it, and that figure stops growing from then on
