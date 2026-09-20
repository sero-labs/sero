## ADDED Requirements

### Requirement: A Workflow's settings read as labelled values

A Workflow page SHALL show its settings as a line of labelled values covering where it runs, where results go, what starts it, its context, its spend, its attempt limit and its time limit. A value whose detail has its own view SHALL open that view from the value itself rather than from a separate button. A setting that the user cannot act on and that the plan already governs, such as how many steps may run at once, MUST NOT take a place on that line.

#### Scenario: Settings are named

- **WHEN** the user opens a Workflow that starts manually
- **THEN** each setting is shown under its own label, and its context and delivery destination open from their values

#### Scenario: Steps at a time is not displayed

- **WHEN** a Workflow's plan sets a limit on steps running at once
- **THEN** that limit still applies and is not shown as a setting on the page

### Requirement: What starts a Workflow, and what is waiting, are distinguishable

Where a Workflow starts from events, the settings line SHALL name the events under what starts it, and their filters and conditions SHALL open from that value. Events that have arrived and not yet run, and the health of the source they come from, SHALL be shown with the Workflow's current state rather than among its settings, because they describe the present. A source that is delaying its requests MUST NOT be coloured as something that needs the user.

#### Scenario: Started by GitHub events

- **WHEN** a Workflow starts on two GitHub events
- **THEN** the settings line says it starts on those events, and their filters and conditions open from that value

#### Scenario: Events are waiting

- **WHEN** three events have arrived and not yet run, and the source is delaying its requests
- **THEN** both facts are shown with the Workflow's state, without the user opening anything
- **AND** neither is coloured as needing the user

### Requirement: A step shows its title, its state and its result

Each step in the Workflow plan's detail view SHALL show its title, its state in words and its result. The step's instruction and its expected result SHALL be behind a disclosure on the step. The model, the agent and the tools SHALL open from one control on the step, and SHALL be shown on the step itself only where the user has changed them from the default. An agent instruction MUST NOT be used as a step's heading.

#### Scenario: A finished step

- **WHEN** a step has finished
- **THEN** the step shows its title, that it is done and its result, with the instruction and expected result behind the disclosure

#### Scenario: A tuned step

- **WHEN** the user has changed one step's model and left its agent and tools at the default
- **THEN** that step shows the changed model, and its agent and tools stay behind the control

### Requirement: A step on a route that was not chosen says so

Where a Workflow's plan branches, the detail view SHALL mark a step whose route was not chosen as not taken, by the same rule the plan map uses to dim it. A step on a branch that is not yet decided SHALL remain pending. A loop back to an earlier step SHALL be drawn on the plan, and its condition and count MUST NOT require a separate banner naming steps by id.

#### Scenario: A branch was not taken

- **WHEN** a pass selected no issue, so the claiming step never ran
- **THEN** the detail view marks that step as not taken, and the plan map dims the same step

#### Scenario: A branch is undecided

- **WHEN** a branch's variable has no value yet
- **THEN** its steps read as pending, not as not taken

#### Scenario: A loop back

- **WHEN** a plan sends a later step back to an earlier one
- **THEN** the loop is drawn on the plan and no banner above it names the two steps by id

### Requirement: A Room states its hold once, with its actions once

Where a Room is stopped waiting on the user, the page SHALL state what is asked in plain words in one place, with the members' own text folded under it. That one place SHALL carry the Room's actions, and those actions MUST NOT also appear in the Room header while it holds them. Where a running Room asks nothing, its stop control SHALL be in the header. The header SHALL keep the Room's name, its state, its spend and its time. A separate control that only opens what the hold already shows MUST NOT be offered.

#### Scenario: A Room on hold

- **WHEN** two members are blocked and have each written a message asking the user to act
- **THEN** one card states the question in plain words, folds both messages under it, and carries message, resume and stop
- **AND** none of those three also appears in the header

#### Scenario: A running Room with no question

- **WHEN** a Room is running and asks nothing
- **THEN** its stop control is in the header

#### Scenario: The state is a sentence, not a count

- **WHEN** two members ask one question
- **THEN** the page says what is asked, rather than reporting a number of things needing the user

### Requirement: Activity that cannot be read is not reported as activity that did not happen

Where a Room's activity comes from a runtime that is not running, the page SHALL say the activity is not available and say what is saved. It MUST NOT say that nothing has happened.

#### Scenario: The Rooms runtime is off

- **WHEN** the Rooms runtime is not running and a Room has ninety-nine saved events
- **THEN** the page says the activity is not available while the runtime is off and that those events are saved

#### Scenario: A Room that really is new

- **WHEN** the runtime is running and a Room has no events
- **THEN** the page says nothing has happened yet
