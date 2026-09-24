## ADDED Requirements

### Requirement: Activity is named for people

Every timeline row, filter and chart bar SHALL show a name a person recognises: `Owner wake` for an owner turn, the research question for research, the Room or milestone title for Rooms, planning and Workflows, and the operation's kind for evidence, repair, evaluation and delivery. A raw operation or source identifier SHALL appear only when no name was saved, and SHALL remain readable in the selected-activity detail. A name MUST be read from the project's saved record when the inspector is read, so journals written before this change are named too. Names MUST NOT be copied from prompts, replies or tool payloads.

#### Scenario: Research run

- **WHEN** a run contains research `res_i5hagjqr` whose saved question is "What should the first minute teach?"
- **THEN** its row, its filter entry and its chart bar read that question, not `room-planning:research:res_i5hagjqr`

#### Scenario: Name was never saved

- **WHEN** a Room charge's Room has no saved title
- **THEN** its row shows the Room identifier, and no other row claims that title

### Requirement: Owner turns are recorded as operations

Each owner turn SHALL be recorded as one `owner-wake` operation with a start, an end and an outcome. Every owner charge made during that turn SHALL name the wake as its parent and SHALL carry the owner's actual model, thinking level and the input, output, cache-read and cache-write token deltas that the session reported for that charge. Owner charges in journals written before this change SHALL be shown under one `Owner` group per run, with model and tokens `unavailable`.

#### Scenario: One owner turn with several charges

- **WHEN** the owner runs one turn that produces 12 usage reads
- **THEN** the timeline shows one `Owner wake` row whose inclusive cost is the sum of those 12 charges
- **AND** expanding it shows the charges with the owner's model and thinking level

#### Scenario: Legacy owner charges

- **WHEN** a run's journal holds 100 owner charges with no wake operation
- **THEN** the timeline shows one `Owner` row containing them, not 100 rows at the top level

### Requirement: Running-total charges are one row

Charges without per-call detail SHALL be shown as one row per kind of source under each activity, such as `Room spend` or `Owner spend`, because each one is only the rise in a running total that Sero read. The row SHALL show the number of updates, their total cost, and one bar from the first update to the last. Selecting it SHALL show the time span, the cost, the number of updates, the coverage and the source, or the number of sources when several were merged. A charge with per-call detail SHALL keep its own row. A kind of source with only one charge SHALL keep that charge's own row.

#### Scenario: A Room's spend

- **WHEN** a research activity holds one planning charge with per-call detail and 62 aggregate charges from its Room
- **THEN** opening it shows two rows: the planning charge, and `Room spend` with `62 updates` and the sum of the 62 costs

#### Scenario: Two owner sessions

- **WHEN** the `Owner` group holds aggregate charges from two owner sessions
- **THEN** it shows one `Owner spend` row, and its detail reads `Sources 2`

### Requirement: Delegated work counts as active time

When the Architect reads a Room's or Workflow's progress, it SHALL record the rise in that run's reported working time on the same journal line as the cost rise: a Room's banked working time plus the period open now, and a Workflow's summed step time. A rise in working time with no cost rise SHALL still be recorded, with a cost of zero, and SHALL NOT charge the budget. A reading that repeats the last figure SHALL record nothing. Active time SHALL count each recorded rise as work that ended when it was read, and SHALL count its overlap with other work once. A figure the run did not report SHALL NOT be recorded as zero.

#### Scenario: A Workflow works without a cost rise

- **WHEN** a Workflow's reported cost stays at $2 while its step time rises from 10 to 15 minutes
- **THEN** the journal gains one line with cost $0 and 5 minutes of working time, and the budget does not change

#### Scenario: Owner and Workflow overlap

- **WHEN** an owner wake runs from minute 0 to minute 10 and a Workflow reports 20 minutes of work at minute 25
- **THEN** Active reads 25 minutes, not 30

### Requirement: Time ranges name their dates across days

A time range in the inspector SHALL show only clock times when both ends fall on one day, and SHALL show the date at both ends when they do not.

#### Scenario: A run open for five days

- **WHEN** a run's first record is at 16 Sep 23:04 and its last at 21 Sep 22:28
- **THEN** the Elapsed tile reads `119h 23m` over `16 Sep 23:04 → 21 Sep 22:28`

### Requirement: The inspector shows the run when it opens

Opening the inspector SHALL read the selected run's summary and its first page of activity without further input. The first screen SHALL show the run's totals, timeline and charts, or a loading state while the read is in flight. Further pages SHALL be read only when the user asks for them from the end of the timeline. Reads SHALL stay bounded as the existing observability requirement states.

#### Scenario: Open a run with recorded activity

- **WHEN** the user opens Run metrics for a project with a run journal
- **THEN** the totals, the timeline and the charts are shown without pressing any control

#### Scenario: A run with nothing recorded

- **WHEN** the selected run has no journal records
- **THEN** the inspector says `Nothing recorded for this run yet.` once, and does not show empty tiles or empty charts

### Requirement: Unmeasured values are not zero

A displayed `0` or `$0.00` SHALL mean a measured zero. In the totals and charts, a value the sources did not measure SHALL read `unavailable`, and a token total SHALL be `unavailable` when no charge in its scope reported tokens. In the selected-activity detail, a fact the sources did not record SHALL be left out, not shown as `unavailable` or zero. A research activity SHALL show its Room members' models and thinking levels as the project saved them.

#### Scenario: Aggregate-only charges

- **WHEN** every charge in a run is aggregate-only with no token counts
- **THEN** the Tokens figures read `unavailable`, not `0`

#### Scenario: Delegated Workflow step

- **WHEN** the user selects a Workflow step whose model was chosen by the Orchestrator
- **THEN** the detail shows no model or thinking fact

#### Scenario: Research Room members

- **WHEN** the user selects a research activity whose Room members were saved with their models
- **THEN** the detail lists each member's name, model and thinking level

#### Scenario: A step nothing was charged to

- **WHEN** the user selects an operation, such as `Workflow plan`, that no charge names or was placed under
- **THEN** its cost reads `no charges recorded` once, and no model, attributable, inclusive, coverage, thinking or token facts are shown

### Requirement: One authoritative cost

The run's attributable cost SHALL be the single headline cost. When part of it is aggregate-only, the cost tile SHALL state that amount as part of the headline, not as a second total. While any filter is on, the filtered subtotal SHALL be shown beside the filter controls together with the full-run cost; with no filter on, no subtotal SHALL be shown.

#### Scenario: Partly aggregate run

- **WHEN** a run's attributable cost is $4.60 and $4.48 of it is aggregate-only
- **THEN** the headline reads `$4.60` and its tile states that $4.48 has no per-call detail

#### Scenario: Owner filter on

- **WHEN** the user selects the Owner chip and owner activity cost $0.04 of $4.60
- **THEN** the filter row shows `$0.04` of `$4.60` and a **Clear filters** control, and the headline tile still reads `$4.60`

### Requirement: Empty filter results say why

When the active filters match no activity, the timeline SHALL say so in place of rows and SHALL offer **Clear filters**. When the only active filter is **Failures only** and the run has no failed activity, it SHALL say `No failures in this run.`. The **Load more activity** control MUST NOT show while the filtered timeline is empty.

#### Scenario: Failures only on a clean run

- **WHEN** the user turns on **Failures only** for a run with no failures
- **THEN** the timeline reads `No failures in this run.` and offers **Clear filters**

#### Scenario: Combined filters match nothing

- **WHEN** the user selects the Evaluation chip with **Failures only** and no evaluation failed
- **THEN** the timeline reads `No activity matches these filters.` and offers **Clear filters**
