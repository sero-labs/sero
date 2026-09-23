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

### Requirement: The inspector shows the run when it opens

Opening the inspector SHALL read the selected run's summary and its first page of activity without further input. The first screen SHALL show the run's totals, timeline and charts, or a loading state while the read is in flight. Further pages SHALL be read only when the user asks for them from the end of the timeline. Reads SHALL stay bounded as the existing observability requirement states.

#### Scenario: Open a run with recorded activity

- **WHEN** the user opens Run metrics for a project with a run journal
- **THEN** the totals, the timeline and the charts are shown without pressing any control

#### Scenario: A run with nothing recorded

- **WHEN** the selected run has no journal records
- **THEN** the inspector says `Nothing recorded for this run yet.` once, and does not show empty tiles or empty charts

### Requirement: Unmeasured values are not zero

A value the sources did not measure SHALL read `unavailable`. A displayed `0` or `$0.00` SHALL mean a measured zero. A token total SHALL be `unavailable` when no charge in its scope reported tokens. A model or thinking level SHALL be `unavailable` when the operation's model was chosen by a delegate and not reported.

#### Scenario: Aggregate-only charges

- **WHEN** every charge in a run is aggregate-only with no token counts
- **THEN** the Tokens figures read `unavailable`, not `0`

#### Scenario: Delegated Workflow step

- **WHEN** the user selects a Workflow step whose model was chosen by the Orchestrator
- **THEN** its model and thinking read `unavailable`

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
