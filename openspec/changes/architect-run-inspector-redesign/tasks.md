## 1. Record owner wakes and parents

- [ ] 1.1 In `runtime/project-usage.ts`, give `recordCharge` an optional `{ parentOperationId, model, thinking, usage }` argument written onto the usage record. Verify with a `trace-query.test.ts` case that the fields come back in the record view.
- [ ] 1.2 In `runtime/owner-session.ts`, open one `owner-wake` span per turn (`${runId}:owner-wake:${turnId}`, session model and thinking) and pass it as the parent of every owner charge in that turn, with token deltas from `getSessionUsage` clamped at zero. Verify with a unit test: one turn with three usage reads yields one wake and three children whose costs sum to the wake's inclusive cost, and a reset counter yields no negative delta.
- [ ] 1.3 In `runtime/project-usage.ts` and `runtime/services.ts`, set the research span as parent for `room-planning:research:<id>` and matching `room:<roomId>` charges, and the planning span for planning charges. Verify with a `trace-query.test.ts` case that a research charge is a child of its research operation.

## 2. Read model: names, legacy folding, lifetime

- [ ] 2.1 In `runtime/trace-query.ts`, build the name map from the project record (D5) and attach `label` to each record view. Verify with a test that research, milestone, `blockedOn` and missing-name cases produce the question, the title, the title and the raw id.
- [ ] 2.2 Fold parentless usage records into per-run synthetic groups (D6). Verify with a fixture of 100 `owner:<uuid>` charges that the query returns one `Owner` group containing all 100, with inclusive cost equal to their sum.
- [ ] 2.3 In `runtime/trace-summary.ts`, report aggregate-only cost, unknown-cost call count and whether any tokens were measured, so the UI can show `unavailable`. Verify with a `trace-summary.test.ts` case where all charges are aggregate: tokens measured is false and aggregate cost equals attributable cost.
- [ ] 2.4 Add the lifetime read: per-run summary checkpoints plus the shared journal, with no detail pages read. Verify with a test that three runs and one shared record give a lifetime total that counts the shared record once.

## 3. Inspector shell and totals

- [ ] 3.1 Replace `Inspector.tsx` with the header row (Project, run title, Scope, Live) and split components per D12. Remove `withDetail` and **Load activity**; read detail on open. Verify in `inspector.test.tsx` that opening the inspector requests `detail: true` once and renders rows without any click.
- [ ] 3.2 Build `InspectorTotals` with the six tiles and counter line (D8), `unavailable` for unmeasured values and no explanatory notes (D1). Verify with tests: an all-aggregate run shows tokens `unavailable` and the cost note `$x.xx without per-call detail`; a call-coverage run shows `per call`.
- [ ] 3.3 Implement Live/Paused for an open run: paused ignores the spend-driven re-read. Verify with a test that a spend change while paused makes no trace call and one resume makes one.
- [ ] 3.4 Show `Nothing recorded for this run yet.` once for a run with no records and no tiles or charts. Verify in `run-state.test.ts` and `inspector.test.tsx`.

## 4. Filters and timeline

- [ ] 4.1 Build `InspectorFilters`: activity chips (D7), model selector from models present, **Failures only**, and the `$filtered of $full` note with **Clear filters** only while a filter is on. Verify with tests that no subtotal renders unfiltered and that **Clear filters** resets chip, model and failures together.
- [ ] 4.2 Build `InspectorTimeline`: overview strip with draggable window, ruler, **Zoom in**, **Zoom out**, **Zoom to selection**, and a virtualized expandable tree showing label, kind, model, thinking, cost and bar per row. Keep the existing keyboard tree navigation. Verify with tests for arrow-key expand and collapse, selection surviving a re-read, and bounded row rendering on a 1,240-record fixture.
- [ ] 4.3 Put the timeline and the detail panel in one grid row and make the tree area fill the timeline panel, continuing the ruler gridlines to the bottom edge (D11). Verify with a capture of frame 04's state (Failures only, three rows, model call selected): the timeline's bottom edge lines up with the detail panel's, and the charts start directly below both.
- [ ] 4.4 Render the empty-filter lines (`No failures in this run.` for failures only, otherwise `No activity matches these filters.`) with **Clear filters**, and hide **Load more activity** while empty. Show **Load more activity** as the last row when older pages exist. Verify with tests for both empty lines and for the control's presence and absence.

## 5. Detail, charts, lifetime

- [ ] 5.1 Build `InspectorDetail` as one fact list with dividers and no sub-headings: title and state chip, kind, time, duration, attributable, inclusive, subtree active, coverage, model, thinking, source, token bar with rows, references, raw id when the label is a name. Verify with tests that a delegated Workflow step shows model `unavailable` and an owner charge shows the owner model.
- [ ] 5.2 Build `InspectorCharts`: cumulative spend, cost by activity or model with the legend toggle, and token composition, as inline SVG, each plot area filling the shared row height with its legend at the bottom (D11); clicking a band or bar highlights matching rows. Verify with tests that a Workflow parent and its children are not double-counted in the breakdown and that selecting a bar highlights its rows.
- [ ] 5.3 Build `InspectorLifetime`: tiles, runs table with **Open**, and cumulative chart across runs with a "run order" axis, a fixed plot height that matches the run charts, and chart-sized axis labels (D11). Verify with a test that **Open** switches scope to that run.

## 6. Match the prototype and finish

- [ ] 6.1 Capture the built inspector at 1240 px and 960 px in the eight states stored in `prototype/` (default, model call selected, Workflows chip, Failures only, empty filter, Project lifetime, 1,240-activity run, 960 px), using the plugin UI screenshot harness with fixture data. Compare each frame region by region with its `prototype/` counterpart and fix every difference other than the D1 removals and the D11 gap fixes. In every frame, check that no blank band is left between or inside panels. Verify by attaching both sets side by side to the pull request.
- [ ] 6.2 Capture the FroggerNeon project from a copy of the `seroarchitectdev` profile, the audit's source, and confirm the issue's nine loaded-state defects and the failures-only defect are gone. Verify by attaching the frames to the pull request.
- [ ] 6.3 Run `pnpm typecheck` from the monorepo root and the architect plugin tests, and confirm no source file exceeds 500 LOC. Verify by the command outputs.
