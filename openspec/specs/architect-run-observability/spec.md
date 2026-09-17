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
