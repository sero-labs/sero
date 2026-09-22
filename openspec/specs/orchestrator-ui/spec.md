## Purpose

Define what Orchestrator Home, the Workflows list and the Rooms list show, so a person can see what is running, what needs them and what a Workflow waits for without opening anything.

## Requirements

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

### Requirement: A Workflow's ending leads with its result

A Workflow page SHALL show one row above its settings carrying the result of its
ending, for every ending. The row SHALL print the reason the Workflow recorded for
that ending, and MUST NOT print a status word the page already states. Where a step
caused the ending the row SHALL name that step, and the recovery controls the page
already offers SHALL stay reachable.

#### Scenario: A completed Workflow

- **WHEN** a Workflow completed
- **THEN** one row above the settings prints the completion reason the Workflow recorded

#### Scenario: A Workflow stopped at a limit

- **WHEN** a Workflow stopped because it reached its cost or time limit
- **THEN** the row prints that reason once, and Restart and Refine plan remain reachable

#### Scenario: A Workflow stopped at a step

- **WHEN** a step blocked the run
- **THEN** the page names that step and offers Retry step beside it

#### Scenario: A Workflow with no recorded reason

- **WHEN** a Workflow ended without recording a reason
- **THEN** the page states that the work ended and does not invent a reason

### Requirement: A Workflow's objective is stated once, with its request folded under it

A Workflow page SHALL state its objective once, and SHALL make the request that
started the Workflow open from a disclosure on the objective. The request SHALL be
reachable for every Workflow, including one that has no objective and one that has
no summary.

#### Scenario: A Workflow with an objective and a summary

- **WHEN** the user opens the objective's disclosure on a Workflow that has a summary
- **THEN** the full request that started the Workflow is shown and the objective is not stated twice

#### Scenario: A Workflow with no objective

- **WHEN** a Workflow has no recorded objective
- **THEN** the request that started it is still reachable from a disclosure in the same place

### Requirement: A file named in a result opens from its row

Where a Workflow's result names a file, the page SHALL offer that file as a control
that opens it, using the host's own file action. A file name MUST NOT be shown only
as plain text.

#### Scenario: A result naming a file

- **WHEN** a step's result names a file the run produced
- **THEN** the name is a control that opens that file

#### Scenario: A reference the host cannot open

- **WHEN** a result names a reference the host cannot open
- **THEN** it is shown without a control rather than as a broken one

### Requirement: A Room's result leads with the result and the plan it produced

A finished Room's result view SHALL show the Room's own closing line as its result,
then the plan the Room produced, open at its first section with the author's
remaining sections folded, each opening from its own row and offering its own file.
The result MUST NOT restate the plan's identifier as text where the plan itself is
shown, and the Room's title and status MUST NOT be repeated in the body.

#### Scenario: A finished Room with a plan and other artifacts

- **WHEN** the result view opens
- **THEN** the result is the Room's closing line, the plan shows its first section open with its own file offered, and the remaining artifacts are listed with a control to open each

#### Scenario: A Room that published no plan

- **WHEN** a Room published no plan
- **THEN** the result view shows the result and lists what it did publish, with no empty plan block

#### Scenario: Where the result was delivered

- **WHEN** a finished Room's result was delivered
- **THEN** the destination and the time are shown once as their own row

#### Scenario: A Room that delivered nothing

- **WHEN** a finished Room's result was not delivered
- **THEN** the page says so, and does not show a destination it did not reach

### Requirement: A Room's duration and spend are said once

A Room's duration and its spend SHALL appear once on the Room page, in the header.
The result view MUST NOT repeat either as a figure of its own. The total inside the
cost-by-member disclosure is the one exception, because the drawing shows it there.
The Team and Artifacts counts MUST NOT remain as figures of their own: the team is
the Room's member list, and the artifacts are the listed artifacts.

#### Scenario: A finished Room

- **WHEN** the result view opens
- **THEN** neither duration nor spend is repeated below the header, and the team and artifact counts are gone from the body

#### Scenario: Cost by member

- **WHEN** the user opens the cost fold
- **THEN** each member's full name is shown with its amount in the drawn list, each row opens that member, and the fold's own summary carries the Room's total

### Requirement: A Room's member list names each member in full

A Room's member list SHALL show each member's full name and its state, in the column
width the drawing gives it. A member's name MUST NOT be truncated.

#### Scenario: Two long member names

- **WHEN** a Room's members have long names and titles
- **THEN** the list shows each in full

### Requirement: A member's facts lead with what the member is

A member's Info tab SHALL show the model, the tools, the access and the spend
before the member's instructions. The working instructions SHALL be complete and
open from the mandate, and the mandate's role, responsibilities, current task and
priorities SHALL remain reachable. Turns, tokens, retries, compactions and skills
SHALL be behind one Usage disclosure. A member that ran without a worktree SHALL
state that among its access facts, and a member that ran with one SHALL keep its
branch and its path.

#### Scenario: A finished member

- **WHEN** the Info tab opens
- **THEN** the model, tools, access and spend are shown first, and the working instructions are folded

#### Scenario: Usage

- **WHEN** the user opens Usage
- **THEN** turns, input, output, cache read, retries, compactions and skills are shown

#### Scenario: No worktree

- **WHEN** a member ran without a worktree
- **THEN** its access states that, and no separate worktree card is shown

#### Scenario: A member with a worktree

- **WHEN** a member ran in a worktree
- **THEN** its access names the branch and the path, and the path still opens the folder

#### Scenario: A member's turns in the header

- **WHEN** the member panel is open
- **THEN** the header still states when the member started and how many turns it has taken, because the drawing shows both there

### Requirement: A member over its spend limit reads as a fault

Where a member's spend has reached its per-member limit, the surface that shows
that member's spend SHALL mark it as a fault by the same rule that marks a project
and a Room at their limits. The marking MUST NOT rest on colour alone, and the
amount SHALL still be shown against the limit it exceeded.

#### Scenario: Over the limit

- **WHEN** a member has spent more than its per-member limit
- **THEN** its spend is marked as a fault in words as well as by its style

#### Scenario: Exactly at the limit

- **WHEN** a member's spend equals its per-member limit
- **THEN** its spend reads as at the limit rather than as healthy

### Requirement: A Room's Delete control is not a peer of its other controls

Deleting a Room SHALL be offered from the Room's ⋯ menu rather than beside the
Room's other actions, and SHALL ask before it deletes. It SHALL be offered wherever
the Room is shown, including from one member's own page.

#### Scenario: Destroying a Room

- **WHEN** the user opens the ⋯ menu on a Room
- **THEN** Delete Room is offered there, not beside the Room's view controls, and it asks before it deletes

#### Scenario: From a member's page

- **WHEN** the user opens the ⋯ menu while reading one member
- **THEN** Delete Room is offered there too
