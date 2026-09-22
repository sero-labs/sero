## ADDED Requirements

### Requirement: A milestone records why its delegated work stopped

A milestone's dispatch SHALL record why the delegated work stopped, taken from that
work's own record, and SHALL record which steps were in flight when a restart
interrupted it. Where the work's own record retains no cause, the dispatch SHALL
record no cause rather than a sentence written without one, and the dispatch MUST
still be recognisable as stopped.

#### Scenario: A Workflow that reached its limit

- **WHEN** a dispatched Workflow stops at its cost or time limit
- **THEN** the milestone records the limit's own reason text

#### Scenario: A Workflow a restart interrupted

- **WHEN** a dispatched Workflow is interrupted by a restart
- **THEN** the milestone records that the work was interrupted and which steps were in flight

#### Scenario: No cause retained

- **WHEN** the delegated work's own record retains no cause
- **THEN** the milestone records no cause and stays recognisable as stopped, so the page states that without inventing one and the work remains recoverable
