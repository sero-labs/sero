## ADDED Requirements

### Requirement: A run's step summary retains each step's title

A Workflow's per-run summary SHALL retain, for each step the run visited, the title
the plan held for that step when the run visited it. A reader SHALL name a step
from the per-run summary without reading the Workflow's current plan. A summary
written before this requirement SHALL load unchanged, and a step whose title the
summary does not hold SHALL be named by its step id rather than by a title taken
from the current plan.

#### Scenario: A run that visited steps

- **WHEN** a run visits two steps
- **THEN** the summary retains both steps' titles

#### Scenario: The plan changed after the run

- **WHEN** the plan's title for a step changed after a run
- **THEN** the run's summary keeps the title the step had when the run visited it

#### Scenario: A summary written earlier

- **WHEN** a per-run summary written before this requirement is read
- **THEN** it loads, and its steps are named by their step ids
