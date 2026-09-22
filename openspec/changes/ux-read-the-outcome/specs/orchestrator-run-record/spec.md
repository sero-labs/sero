## Purpose

What a Workflow's per-run summary retains about why the run ended and which steps
it was on, so a reader can state what happened without reconstructing it from
other files.

## ADDED Requirements

### Requirement: A run's ending is retained with its cause

A Workflow's per-run summary SHALL retain the run's block, including its kind and
its own reason, when the run ended with one. It SHALL retain which steps a restart
left in flight. A reader of the per-run summary MUST NOT need any other file to
state why the run ended.

#### Scenario: A limit ended the run

- **WHEN** a run ends because it reached its cost or time limit
- **THEN** the summary retains the block with the limit's own reason text

#### Scenario: A restart interrupted the run

- **WHEN** Sero restarts while a run is in flight
- **THEN** the summary retains that the run was interrupted and which steps were in flight

#### Scenario: Several steps in flight

- **WHEN** a run is interrupted with more than one step in flight
- **THEN** the summary retains every interrupted step, and none is dropped in favour of one

### Requirement: A step a restart interrupted is not reported as completed

A step whose activation a restart interrupted SHALL be reported as interrupted in
the run summary. It MUST NOT be reported as completed, and the report MUST NOT
depend on whether that activation's last attempt had already finished.

#### Scenario: One step in flight at the restart

- **WHEN** a run is interrupted with one step in flight
- **THEN** that step reads as interrupted in the summary, and every other step keeps its own outcome

#### Scenario: The interrupted step's attempt had finished

- **WHEN** a restart interrupts a step whose last attempt had already completed
- **THEN** that step reads as interrupted, because the run did not finish it

### Requirement: A summary without a cause is distinguishable from one with a cause

A per-run summary SHALL distinguish a run that ended with a recorded cause from one
that did not. A summary written before this requirement SHALL load unchanged, and a
reader SHALL state only what the summary retains rather than inferring a cause.

#### Scenario: A summary written earlier

- **WHEN** a per-run summary written before this change is read
- **THEN** it loads with no block and no interrupted step, and the reader states that the work stopped without a recorded cause

#### Scenario: A run that completed

- **WHEN** a run completed normally
- **THEN** no block is retained and none is shown
