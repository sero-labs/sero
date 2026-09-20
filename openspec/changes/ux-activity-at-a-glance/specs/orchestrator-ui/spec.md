## Purpose

Define what Orchestrator Home, the Workflows list and the Rooms list show, so a person can see what is running, what needs them and what a Workflow waits for without opening anything.

## ADDED Requirements

### Requirement: One definition of active

Orchestrator Home and the Workflows list SHALL derive a Workflow's state from the same rule and the shared activity vocabulary. A Workflow counts as active only when a run is live by that rule. A saved status label MUST NOT be shown as a state word on its own.

#### Scenario: Home and the tab agree

- **WHEN** one Workflow is armed on triggers with no live run
- **THEN** Home counts nothing as active and the Workflows list reads `Waiting for a trigger` for it, and neither says `Active`

#### Scenario: A live run

- **WHEN** a run is live for one Workflow
- **THEN** Home counts one active and the Workflows list reads `Working` for that Workflow

### Requirement: Home opens on status and the work that needs you

Orchestrator Home SHALL open on one status line covering the workspace and then the work that needs the user. Creating a Workflow, a Room or a Goal SHALL be offered as three buttons in the header, and their explanation SHALL be behind one "What are these?" disclosure rather than three cards in the body. Counts already shown on a tab MUST NOT be repeated on Home, and a tab with nothing to count shows no count.

#### Scenario: Nothing running

- **WHEN** nothing is running in the workspace and one Workflow is armed
- **THEN** Home's status line says nothing is running, names the armed Workflow and shows the spend for the workspace

#### Scenario: Creating from Home

- **WHEN** the user wants to create a Room
- **THEN** a Room button is in the header, and the explanation of Workflows, Rooms and Goals is available from one disclosure

### Requirement: Needs you groups by the work it belongs to

Several items needing the user that belong to one Workflow or Room SHALL be grouped under that name, printed once, each item keeping its own action. The number of items, not the number of groups, SHALL be what the Needs you count reports.

#### Scenario: Three suggested changes to one Workflow

- **WHEN** one Workflow has three suggested changes to review
- **THEN** its name appears once with three rows under it, each with its own Review action, and the count reads three

### Requirement: The Workflows list is full width and rows open a page

The Workflows tab SHALL show a full-width list with no detail pane beside it. Each row SHALL show the Workflow's full title without truncation, its state in words, what it waits for, when it last ran, and its spend. An agent instruction MUST NOT be used as a row's summary line. Selecting a row SHALL open that Workflow on its own page with a link back to the list, and the list SHALL NOT show a placeholder telling the user to select something.

#### Scenario: Long title

- **WHEN** a Workflow's title is longer than the old pane's column allowed
- **THEN** the row shows the whole title

#### Scenario: Opening and returning

- **WHEN** the user selects a Workflow row and then the back link
- **THEN** the Workflow opens on its own page, and returning restores the list with the user's search and scroll position

#### Scenario: Nothing selected

- **WHEN** the user opens the Workflows tab
- **THEN** the list fills the width and no "Select a Workflow from the list." placeholder is shown

### Requirement: A Room row says what it waits for

A Rooms list row SHALL show the Room's name, its state in words and, when it waits on the user, what is asked and how long it has waited. The Room's brief MUST NOT be the row's summary line and stays complete inside the Room. Rows SHALL keep their member avatars and member count.

#### Scenario: A Room waiting on the user

- **WHEN** a Room paused nine days ago to ask the user one question
- **THEN** the row says it is waiting for the user, for nine days, and names the question asked
- **AND** the row does not begin with the Room's brief

#### Scenario: Two Rooms with the same name

- **WHEN** two Rooms share a name
- **THEN** both keep that name, and their dates and results tell them apart
