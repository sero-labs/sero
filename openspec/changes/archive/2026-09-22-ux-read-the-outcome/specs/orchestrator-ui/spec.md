## ADDED Requirements

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
