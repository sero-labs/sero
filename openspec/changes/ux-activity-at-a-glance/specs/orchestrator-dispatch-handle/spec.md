## MODIFIED Requirements

### Requirement: No other widening

The handle MUST NOT expose delete, revise, library, catalog or override actions to plugin runtimes, and MUST NOT add IPC or a host capability declaration. It SHALL expose one arming action that disarms or re-arms the triggers of a Workflow the caller created, so an owner can stop new runs starting without ending the Workflow. That action MUST NOT abort an in-flight run, change the Workflow's plan, or reach a Workflow the caller did not create.

#### Scenario: Unsupported action

- **WHEN** a plugin runtime sends an action kind outside the typed set
- **THEN** the type check fails at build time and the runtime rejects it at run time

#### Scenario: Disarm leaves a running step alone

- **WHEN** a runtime disarms a Workflow whose run is in flight
- **THEN** every trigger stops starting new runs and the in-flight run continues to its own end

#### Scenario: Re-arm names its triggers

- **WHEN** a runtime re-arms the triggers it disarmed earlier
- **THEN** only those triggers are armed again, and a trigger disarmed by the user stays off

#### Scenario: A foreign Workflow

- **WHEN** a runtime tries to disarm a Workflow it did not create
- **THEN** the action fails, names the Workflow, and nothing changes

## ADDED Requirements

### Requirement: The index reports live runs honestly

The watched Orchestrator index SHALL let a reader tell a run that is attached and reporting in this Sero session from a saved status left behind by an earlier one. A liveness mark from an earlier session MUST NOT be readable as live after a restart.

#### Scenario: Restart with an orphaned run

- **WHEN** Sero restarts while a Workflow's saved record still claims an active run
- **THEN** the index no longer marks that run live, and readers show its last saved report instead

#### Scenario: A run reports

- **WHEN** a run starts and reports in this session
- **THEN** the index marks it live while it runs, and unmarks it when it ends
