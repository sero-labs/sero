## Context

See proposal.md for why. The facts that shape the approach:

- The inspector lives in `plugins/sero-architect-plugin/ui/components/Inspector*.tsx`. It calls the `trace` action, which runs `runtime/trace-query.ts:queryTrace`. That reads `runtime/run-journal.ts` NDJSON files and folds them with `runtime/trace-summary.ts`. Detail is opt-in (`detail: true`) and paged at 100 records, capped at 200.
- Owner usage is written by `runtime/owner-session.ts` as `recordCharge(..., 'owner:<sessionId>', delta, 'aggregate')` on every `tool_start` and `tool_end`. It has no parent, no model and no tokens. No `owner-wake` span is ever opened, although `ObservationOperationKind` already has the kind. This is the cause of the 100 identical rows.
- The owner session knows its model and thinking level (`record.session.model`, `record.session.thinking`), and `getSessionUsage` returns cumulative input, output, cache-read and cache-write tokens.
- `services.ts:span()` opens spans for research, planning, workflow and evidence with ids `${runId}:${kind}:${suffix}`. Research charges in `project-usage.ts` use sources `room:<roomId>` and `room-planning:research:<researchId>` with no parent.
- Names exist only in the project record: `research[]` and `pendingResearch` carry `question` and `roomId`; milestones carry `title`; `blockedOn` carries a Room or Workflow `title`. The journal carries none.
- The trace already re-reads when `record.budget.spentUsd` changes, because the project record is pushed through app state. That is the live update path.
- Reference frames of the prototype are in `prototype/` in this change: 01 default, 02 model call selected, 03 Workflows chip, 04 Failures only, 05 empty filter, 06 Project lifetime, 07 1,240-activity run, 08 960 px.

## Goals / Non-Goals

**Goals:**

- The built screen matches frames 01 to 08 region for region, minus the sentences listed in D1.
- Owner cost reads as named wakes with a model and tokens.

**Non-Goals:**

- Recording the tokens and model a Room or Workflow used. The Orchestrator counts them, but the Architect saves only the cost today. A research activity shows its Room members' saved models; any other fact that was not recorded is left out of the detail panel.
- Rewriting old journals. Legacy data is folded at read time only.
- The six other audit flows, and any change to the project page or its menu.
- A new push channel. Live uses the existing record push.

## Decisions

### D1. The prototype is the layout; its help text is not built

The prototype is binding for structure, order, controls and states. The user asked for no extraneous text, so these prototype strings are not built:

| Prototype text | Decision |
|---|---|
| Review note "Check: expand the tree…" | Not part of the app |
| Tile notes "overlapping work counts once", "charged once in lifetime", "unpriced or unobserved", "priced, retained activity", "counted once", "observed causes only", "retained call detail" | Dropped. Tiles keep notes that carry data: the clock range, the wait breakdown, the coverage |
| Tile label "Active (union)" | Becomes "Active" |
| Keyboard hint strip "drag the window · ← → pan · Shift+← → zoom · Home reset" | Dropped. The keys stay and are in the overview slider's accessible description |
| "Click a time band to highlight activities", "Click a bar to highlight matching activities. Parent cost is inclusive; children are not added again." | Dropped. Bars and bands keep a pointer cursor and focus ring |
| Detail sub-headings MODEL, TOKENS, NOTE, REFERENCES, SHARED | Dropped. The facts become one list with dividers between groups; the token bar sits under the Tokens row |
| "No token measurements were retained… unknown, not zero." | Replaced by the value `unavailable` |
| "Opening a reference obeys the existing project and profile access checks." | Dropped. The check still runs |
| "Full run · $1.56 attributable" in the filter row | Shown only while a filter is on (D6) |
| Footer run note "Setup, discovery, charter…" | Dropped. It is prototype fixture text |
| "Runs have separate time origins…" and "Unassigned overhead … is not placed on this line." under the lifetime chart | Dropped. The x axis is labelled "run order" instead |
| "Charged once in lifetime totals. Neither run claims a guessed share." under linked rows | Dropped. Linked rows keep the "linked, not attributed" value |

Kept because each is a label or a value: panel titles (Timeline, Cumulative spend, Cost by activity or model, Token composition, Runs), the "18 of 47 activities" count, the counter line, the status legend, and the empty-state lines required by the spec.

Alternative: build the prototype verbatim. Rejected: the user's instruction for this change overrides the prototype's review copy.

### D2. Load on open

`Inspector` requests `detail: true` on first read. `withDetail` state and **Load activity** go. `run-state.ts` keeps the loading, answered and incomplete states and loses the "not asked yet" branch.

### D3. Owner wakes become spans with model and tokens

`owner-session.ts` opens an `owner-wake` span per turn through the existing span recorder, with id `${runId}:owner-wake:${turnId}` and the session's model and thinking. `readUsage` already holds the last cumulative cost; it also holds the last cumulative token counts and computes token deltas the same way. `recordCharge` gains an optional `{ parentOperationId, model, thinking, usage }` argument written onto the usage record. Coverage for owner charges becomes `call` only when tokens were reported; otherwise it stays `aggregate`.

Alternative: one usage record per turn end. Rejected: a crash mid-turn would lose the partial cost the per-tool reads protect today.

### D4. Research and planning charges get a parent

Most sources already name what they paid for: `room-planning:research:<id>`, `room-planning:dispatch:<milestoneId>`, `room:<roomId>` and `dispatch:<kind>:<loopOrRoomId>`. Those are placed when the journal is read (D6), which also covers journals written before this change. Only `runProjectModel` charges (`research:<usageId>`, `capture:<usageId>`) name nothing, so they record their span as parent: `${runId}:research:<id>` or `${runId}:evidence:<milestoneId>:capture`.

Alternative: write a parent on every charge. Rejected: it adds a second path next to the read-time placement that old journals need anyway.

### D5. Names are joined at read time

`trace-query.ts` builds a name map from the project record and attaches `label` to each record view and group. Order: research question; milestone title; `blockedOn.title`; `Owner wake` for `owner-wake`; the operation kind in words; then the raw id. The journal stays metadata-only, old journals get names, and a renamed milestone shows its current title.

Alternative: write names into the journal. Rejected: it copies owner-authored text into metric records, which the observability spec forbids by default, and it does nothing for old runs.

### D6. Placing charges and naming groups at read time

`runtime/trace-activity.ts` builds the tree from the bounded fold, so group costs cover the whole folded run, not only the loaded detail pages. A charge that names a parent goes there. Otherwise it is placed by source:

- `owner:*` goes under one `Owner` group per run.
- `room-planning:research:<id>` goes under that research. So does `room:<roomId>` when a research entry names that Room.
- `dispatch:*:<id>` and `room-planning:dispatch:<milestoneId>` go under the milestone whose dispatch id matches. The group is labelled with the milestone title.
- A `room:<id>` or `dispatch:*:<id>` with no match gets its own group, named from `blockedOn.title` or else the raw id.
- Anything else goes under `Unassigned`.

A real journal (FroggerNeon, 506 records) has 336 `dispatch:workflow:*` charges, so milestone grouping is the largest case, not an edge case. Operations the runtime opened under a milestone (`workflow:<m>:plan`, `evidence:<m>`, `planning:<m>:room-plan`) nest under that milestone's group. An operation id that starts again is one row with a retry count. A group's timing is its first and last charge. Its state comes from the record: the milestone status, or whether the research has saved findings. Detail pages carry each charge's `nodeId` and `label`, so the UI places leaf rows under the same nodes. The UI merges a node's aggregate charges into one row per kind of source (`room`, `owner`, `dispatch:workflow`, `capture`). Each aggregate charge is the rise in a running total that Sero read, so its time says when Sero checked, not when the work happened. FroggerNeon's research row goes from 63 children to 2 and its Owner row from 37 to 1. Charges with per-call detail keep their own rows.

### D7. Activity chips map operation kinds

Owner (`owner-wake`), Research (`research`), Planning (`planning`, `trigger-extraction`), Rooms (`room`, `room-member`), Workflows (`workflow`, `workflow-step`, `workflow-attempt`, `subagent-run`), Evaluation (`evaluation`, `evidence`), Repair (`repair`), Waits (wait records), Unassigned (the synthetic group). Every chip is shown, as in the prototype, so the row does not shift between runs; an empty chip leads to the empty-filter line. The model selector lists the models present in the run.

### D8. Cost tile and filtered subtotal

Tiles: Elapsed, Active, Waiting, Attributable cost, Linked shared, Unknown cost. The cost tile note reads `per call` when all coverage is call, otherwise `$x.xx without per-call detail`. The filter row shows `$filtered of $full` and **Clear filters** only while a chip, model or **Failures only** is active. Money shows two decimals; a non-zero amount under half a cent reads `<$0.01`.

### D9. Scope and Live

The Scope selector lists `Project lifetime` then each run, newest first, defaulting to the newest run. Lifetime folds each run within the same 1,000-record bound as a run view (no runtime code writes summary checkpoints today) and the shared journal, then renders the prototype's runs table and cumulative chart; **Open** switches scope to that run. **Live** shows only for an open run. Paused stores the last page and ignores the spend-driven re-read until resumed. Live state is not persisted.

### D10. Charts without new dependencies

Cumulative spend and token composition are inline SVG like the prototype's `charts.js`. Cost by activity or model reuses `ui/lib/charts.ts` aggregation, which already keeps parent inclusive totals out of child sums. The **Breakdown by activity/model** toggle in the legend row switches it.

### D11. No empty space

The prototype leaves blank space in three places: below a short timeline beside a tall detail panel (frames 04 and 05), below the token composition legend (frame 01), and inside the lifetime chart (frame 06). The build fixes all three:

- The timeline and the detail panel share one grid row, so both panels have the row's height. The tree area is a flex child that fills the timeline panel. Its minimum height is the prototype's 384 px viewport. With few rows, the ruler gridlines continue down to the panel's bottom edge, and the empty-filter line sits centred in that area. When the detail panel is taller than the page allows, the detail panel scrolls. The timeline does not grow past it.
- The three charts share one row height. Each chart's plot area grows to fill it, and its legend is pinned to the bottom.
- The lifetime chart gets a fixed plot height that matches the run charts, and axis labels use the chart text size.

Alternative: move the charts into the left column under the timeline. Rejected: it changes the prototype's order and gives three charts a third of the width.

### D12. File layout

Split to keep every source file under 500 LOC: `InspectorHeader`, `InspectorTotals`, `InspectorFilters`, `InspectorTimeline` (overview, ruler, tree), `InspectorDetail`, `InspectorCharts`, `InspectorLifetime`. Filter and expansion preferences stay in `useInspectorPreferences` on the host layout service.

### Differences in the build

- The wake id carries the wake kind (`<run>:owner-wake:<kind>:<id>`), so the row reads "Owner wake · your decision" without a second lookup. Older ids read "Owner wake".
- The detail panel shows "Source" only for a charge or a merged spend row. An activity row shows its ID only when the label differs from it.
- No "Linked shared" line under the timeline. The Linked shared tile carries that number once.
- Project lifetime shows the unassigned amount as a tile, not as a runs table row.
- Waiting reads `0s` when no waits were recorded, because the owner records every wait it starts.
- Zoom in, Zoom out and Zoom to selection are icon buttons, where the prototype has text buttons. Each keeps its name as its accessible label and tooltip.
- The detail panel heading stops at three lines. A research question can run to a paragraph and would push every fact below the fold.
- A research row lists its Room members with their models and thinking levels, read from the saved research record.
- Time ranges show dates when they cross a day (see the spec requirement on time ranges).
- When a counter goes down after a session restart, the charge records no tokens and is marked `aggregate`, instead of tokens clamped at zero. A clamped zero would read as a measured zero.

### D13. Delegated working time

Active was the union of the operations the Architect times itself, so a run whose work happened in Rooms and Workflows read 1.5m over five days. The Orchestrator already keeps each Room's working time (`activeMs`, plus `activeSince` for the period open now) and each Workflow's summed step time (`usage.durationMs`). The Room view now publishes both Room fields. The Architect records the rise next to the cost rise and keeps a `countedActiveMs` baseline beside `chargedUsd`, so a re-read adds nothing. The trace fold places each rise as the time that ended at the reading, because that is all a reading says. Gaps between records are not read as idle or as work: a quiet gap can mean either. A Workflow's summed step time can exceed its wall clock when steps run in parallel, so each rise is clipped to start no earlier than the run's first record, and Active never exceeds Elapsed.

Alternative: record Room and Workflow spans as operations. Rejected: the Architect sees only readings, not the start and end of each member turn or step, so the spans would be guesses.

## Risks / Trade-offs

- [Owner charges read on every tool event produce many child rows under one wake] → The wake row is collapsed by default and its inclusive cost is the sum; children are the call detail.
- [The first reading of a run dispatched before this change carries all its past working time at once] → It lands as one interval ending at that reading. The total is right; its place on the timeline is late.
- [A merged spend row covers only the charges loaded so far] → Its parent's cost is the full fold. Load more adds the next page's charges to the same row.
- [Name join reads the whole project record per query] → The record is already in memory in the runtime; the join is a map built once per query.
- [Token deltas from cumulative counters can go negative after a session restart] → Record no tokens for that charge and mark it `aggregate`.
- [Removing help sentences hides the conservation rule] → The rule is enforced in the numbers and covered by tests; the spec keeps it.
- [Visual drift from the prototype] → Task 6 captures the built screen at the same widths and states as `prototype/` and compares frame by frame.

## Migration Plan

No data migration. New journals get wakes and parents; old journals are folded at read time (D6). Rollback is a revert: new fields on usage records are ignored by the old reader.
