## MODIFIED Requirements

### Requirement: A Workflow's settings read as labelled values

A Workflow page SHALL show its settings as a line of labelled values covering the project it came from, where it runs, where results go, what starts it, its context, its spend, its attempt limit and its time limit. Where the record names the project that created the Workflow, the value SHALL name that project under its own label and SHALL open that project in Architect. That name is the project's name when the Workflow was created; the link SHALL use the project id, so it still reaches a renamed project. Where the record names no project, the Workflow SHALL show no such value. A value whose detail has its own view SHALL open that view from the value itself rather than from a separate button. A setting that the user cannot act on and that the plan already governs, such as how many steps may run at once, MUST NOT take a place on that line.

#### Scenario: Settings are named

- **WHEN** the user opens a Workflow that starts manually
- **THEN** each setting is shown under its own label, and its context and delivery destination open from their values

#### Scenario: Steps at a time is not displayed

- **WHEN** a Workflow's plan sets a limit on steps running at once
- **THEN** that limit still applies and is not shown as a setting on the page

#### Scenario: A Workflow an Architect project created

- **WHEN** a Workflow was created by an Architect project that had a name when the work was dispatched
- **THEN** the settings line names that project under its own label, and the value opens that project in Architect

#### Scenario: A Workflow with no originating project

- **WHEN** a Workflow was created directly rather than by an Architect project
- **THEN** the settings line shows no project value

## ADDED Requirements

### Requirement: A Room names the Architect project that opened it

Where a Room's record names the project that created it, the Room's header SHALL name that project beside the Room's state and SHALL open that project in Architect. It SHALL be shown whether or not the Room is waiting on the user. That name is the project's name when the Room was created; the link SHALL use the project id, so it still reaches a renamed project. A Room whose record names no project SHALL show no such name.

#### Scenario: A Room dispatched from a project

- **WHEN** a Room was created by an Architect project that had a name when the work was dispatched
- **THEN** the Room's header names that project beside its state, and the name opens that project in Architect

#### Scenario: A Room created directly

- **WHEN** a Room was created directly rather than by an Architect project
- **THEN** its header names no project

#### Scenario: The name is not an action on the hold

- **WHEN** a Room is stopped waiting on the user and the hold carries the Room's actions
- **THEN** the project's name is still shown in the header
