## Purpose

Explain the actual cost, timing and execution of a complete Architect objective across owner activity, delegated agents and supporting operations in one visual inspector.

## Requirements

### Requirement: Runs follow objectives rather than sessions

Architect SHALL retain one initial run covering setup and discovery through initial delivery, then a separate run for each maintenance objective from triage onward. Each run SHALL include its related owner activity, research, planning, Rooms, Workflows, repairs, verification and delivery. Retries, pause/resume and restart SHALL retain run identity. The user SHALL also be able to inspect project-lifetime totals. An event dismissed during triage SHALL remain a recorded no-work outcome, not a successful product delivery.

#### Scenario: Initial delivery and maintenance

- **WHEN** a project completes initial delivery and later handles a maintenance objective through two delegated milestones
- **THEN** the initial work and maintenance work appear as two runs
- **AND** the maintenance run includes both milestones and its related owner and supporting work

#### Scenario: Interrupted run resumes

- **WHEN** Sero restarts while a milestone is in progress
- **THEN** reconciliation retains its run identity and known work rather than recording another run for the retry

#### Scenario: No fix is needed

- **WHEN** maintenance triage dismisses an event
- **THEN** its model usage and time remain recorded with a no-work outcome

### Requirement: Cross-objective costs remain explicit

An activity serving several objectives SHALL be recorded and charged once, with links to the affected runs. Run views SHALL distinguish directly attributable costs from linked shared costs. Unassignable project overhead and historical usage SHALL remain visible in lifetime totals. The system MUST NOT invent an allocation or count shared charges multiple times in project totals.

#### Scenario: One wake serves two objectives

- **WHEN** a coalesced owner wake contains work for two maintenance objectives
- **THEN** its shared activity is linked from both runs and counted once in project totals
- **AND** neither run presents a guessed share as an exact attributed cost

### Requirement: The timeline represents observed execution

The inspector SHALL show time-aligned, expandable activity for owner wakes, Rooms and members, Workflows and step attempts, model calls, tool calls and supporting operations. It SHALL show actual concurrency, handoffs, waits, retries, failures, interruptions and compactions rather than a fixed pipeline or a replay of the planned graph. A persistent session MUST NOT appear continuously active between its turns. Available observations SHALL update during a live run without clearing the user's selection or expansion state.

#### Scenario: Parallel specialists

- **WHEN** two Room members work concurrently and a later synthesis depends on their results
- **THEN** the timeline shows their measured overlap and the later synthesis
- **AND** it does not serialize the display to match roster order

#### Scenario: Same tool runs concurrently

- **WHEN** an agent starts two calls to the same tool
- **THEN** their distinct identities keep their timing and outcomes separate

#### Scenario: Live update while inspecting

- **WHEN** the user expands a completed step and new run events arrive
- **THEN** new measurements appear without closing that step or replacing its selected detail

### Requirement: Cost totals conserve reported usage

Combined totals SHALL include all available priced owner, planning, research, worker, repair, evaluation and verification usage, including failed attempts. Repeated cumulative reports and restart reconciliation MUST NOT duplicate charges. Parent inclusive totals MUST NOT be added again to their children's costs. Known aggregate usage without detailed call coverage SHALL remain identifiable as such. Run totals and project budget accounting SHALL reconcile for the same scope, with any unknown or shared amounts explained.

#### Scenario: Progress is delivered twice

- **WHEN** a worker's cumulative usage snapshot is received twice and again after restart
- **THEN** its cost is charged once and the timeline retains one canonical operation

#### Scenario: Parent and child selected

- **WHEN** a chart groups a Workflow and its nested model calls
- **THEN** the Workflow's inclusive amount is not counted a second time in the total

### Requirement: Token and model details preserve provenance

The inspector SHALL retain input, output, cache-read and cache-write measurements where available, actual provider/model, thinking level and the source of model selection. Cached usage MUST NOT be priced as fresh input or double-counted in a token composition chart. Unsupported cache splits, first-token timing or other optional measurements SHALL be labelled unavailable. Model estimates MUST NOT replace measured usage.

#### Scenario: Provider lacks a cache split

- **WHEN** a provider reports a cost but no separate cache counters
- **THEN** the known cost remains visible and the cache split is unavailable rather than zero

### Requirement: Timing distinguishes elapsed work and waiting

The inspector SHALL distinguish elapsed run time, the union of observed active intervals, and observed waiting causes such as queueing, approval, pause or backoff. Summed parallel worker durations MUST NOT be labelled elapsed or active run time. Unobserved gaps SHALL be unknown. Agent starts, turns, model calls, retries and compactions SHALL be separate counters.

#### Scenario: Two workers overlap

- **WHEN** two workers each work for ten seconds during the same ten-second interval
- **THEN** the interval contributes ten seconds to active run time, not twenty

#### Scenario: Approval waits while another worker runs

- **WHEN** one operation waits for approval while another works
- **THEN** the view shows both states without classifying the entire interval as idle or subtracting the overlap twice

### Requirement: Charts and activity details are linked

The inspector SHALL provide cumulative spend over time, cost breakdowns by activity or model, and available token composition. Selecting a chart segment SHALL highlight the related activities. Selecting an activity SHALL show its objective or operation, state, actual model settings, time, cost, token detail, errors and authorized evidence/session links where available. Time-range zoom, expansion and activity/model/failure filters SHALL be available. The view SHALL identify whether a total describes the full run or the current selection.

#### Scenario: Investigate a cost increase

- **WHEN** the user selects a spend interval or model segment
- **THEN** the corresponding activities are highlighted and the user can inspect their measured details without leaving the run

#### Scenario: A filter hides most work

- **WHEN** the user filters the timeline to failures
- **THEN** selected-scope totals and full-run totals remain distinguishable

### Requirement: Partial history and unfinished work stay honest

Historical runs SHALL show only measurements supported by retained evidence. Missing call traces, usage, attribution or timing SHALL be marked incomplete or unavailable, never fabricated as zero or precise reconstructed spans. Paused, blocked or budget-limited work MUST NOT be shown as accepted completion. Late usage from in-flight work after Stop SHALL remain attached to its original run. Stale or pruned detail references SHALL be explained.

#### Scenario: Legacy project

- **WHEN** an older project has aggregate spend but no request timing or cache details
- **THEN** the inspector shows its known aggregate and missing coverage without generating fictional calls

#### Scenario: Stop leaves a worker running

- **WHEN** the user stops Architect but a delegated worker continues
- **THEN** its activity and later cost remain visible on the original run until the worker settles

### Requirement: Observability is bounded and respects access

Run summaries and paged details SHALL be readable without loading all project transcripts or events into the main page. Live updates and large histories SHALL use bounded rendering and buffering. Detailed metrics SHALL stay profile-local and MUST NOT expose another project's data. Raw prompts, reasoning, secrets and tool payloads MUST NOT be copied into metric records by default. On-demand session or evidence detail SHALL use existing authorization and redaction. A telemetry failure SHALL be visible as incomplete coverage and MUST NOT cause paid work to replay or budget checks to be bypassed.

#### Scenario: Large run opens

- **WHEN** a run has more activities than the viewport can display
- **THEN** the inspector loads bounded summary and detail pages without reading every transcript

#### Scenario: Unauthorized detail reference

- **WHEN** a detail request points outside the caller's authorized project or profile
- **THEN** the request is refused without exposing its content

#### Scenario: Telemetry persistence fails

- **WHEN** metrics cannot save an observation
- **THEN** coverage is marked incomplete while the existing execution and budget rules remain in force

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
