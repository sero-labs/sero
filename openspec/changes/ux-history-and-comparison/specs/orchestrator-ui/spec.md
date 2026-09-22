## ADDED Requirements

### Requirement: A Workflow's run rows name their steps and state why a run stopped

A Workflow's attempt history SHALL show one row per run. Each row SHALL state the
run's number, a chip carrying its ending, the day and time it started, and the
steps it visited by the titles the plan held when the run visited them, in the
order the run visited them. A run that ended with a recorded reason SHALL print
that reason in the chip, and MUST NOT print a status word the reason already
states. A run whose summary holds no title for a step SHALL name that step by its
step id, rather than by a title taken from the current plan. A run that visited no
step SHALL state why in place of the steps. Each row SHALL keep its duration, its
tokens and its cost, and SHALL keep the badges naming the trigger that started it
and the delivery it produced.

A row MUST NOT repeat a count of step outcomes beside the steps themselves, and
MUST NOT print a full locale date stamp in place of the drawing's day, short month
and time.

#### Scenario: A run that stopped at a limit

- **WHEN** a run ended because it reached its cost limit
- **THEN** its chip prints the limit's own reason, such as "Stopped at the $3 spend limit"

#### Scenario: A run that visited steps

- **WHEN** a run visited two steps
- **THEN** its row names both steps by their titles, in the order they ran, and shows no count of outcomes beside them

#### Scenario: The ending and the start

- **WHEN** a run is shown
- **THEN** the chip carries its ending and the start reads as the day, short month and time, such as `10 Sep, 13:09`

#### Scenario: A summary written earlier

- **WHEN** a run's summary holds no title for a step
- **THEN** its row names that step by its step id

#### Scenario: A run that visited no step

- **WHEN** a run ended without starting a step
- **THEN** its row states why in place of the steps, rather than showing an empty line

### Requirement: What reflection has learned is counted and dated

A Workflow's "What reflection has learned" section SHALL carry the number of
lessons it holds, and each lesson SHALL show the day it was recorded. A lesson's
text SHALL be complete.

#### Scenario: Two lessons

- **WHEN** a Workflow holds two lessons
- **THEN** the section carries a count of two and each lesson shows the day it was recorded

### Requirement: A Room's publish row names its artifact and opens it

Where a Room's activity records a published artifact, the row SHALL show what was
published with the artifact's title, and SHALL offer a control that opens the
artifact's file. The row MUST NOT show the file name alone in place of what was
published, and MUST NOT add a second row that holds only the file name.

#### Scenario: A published plan

- **WHEN** a member publishes a plan
- **THEN** the row names the plan and offers a control that opens its file

#### Scenario: A file the page cannot open

- **WHEN** the artifact's reference cannot be opened from the page
- **THEN** the row still names what was published and offers no broken control

### Requirement: A Room's activity filters and side-panel tabs say what each holds

Each activity filter on a Room SHALL show how many events it selects. Each
side-panel tab that holds a countable list SHALL show how many items it holds:
Work, Claims and Artifacts. The Brief tab and the Changes tab MUST NOT carry a
count. A filter or tab that holds nothing SHALL show a count of zero and SHALL
stay usable. The `All` filter SHALL select every event the Room recorded. A
filter's count is of events and a tab's count is of that panel's own items, so a
word that names both, such as `Work`, shows a different number in each place.

#### Scenario: The activity filters

- **WHEN** the activity feed shows its filters
- **THEN** each filter shows how many events it selects, and each keeps the name the drawing gives it

#### Scenario: The side-panel tabs

- **WHEN** the Room's side panel shows its tabs
- **THEN** Work, Claims and Artifacts each show their count, and Brief and Changes carry none

#### Scenario: An empty tab

- **WHEN** a Room's Claims tab holds nothing
- **THEN** the tab shows a count of zero, is shown dimmer than the tabs that hold items, and can still be opened

#### Scenario: Two lists named Work

- **WHEN** the activity filter `Work` and the side-panel tab `Work` are shown together
- **THEN** each shows its own count, so the events one names and the items the other names are not read as the same list

#### Scenario: The All filter

- **WHEN** the user selects the `All` filter
- **THEN** every event the Room recorded is shown

### Requirement: A Room's brief ends at its last item

A Room's brief SHALL end at the last item it holds. A paragraph explaining how the
brief is built MUST NOT be shown inside the brief.

#### Scenario: A brief that ends at its last item

- **WHEN** the user opens the Brief tab
- **THEN** the brief ends at its last field, and no explanation follows it
