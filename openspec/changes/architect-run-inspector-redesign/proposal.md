## Why

The shipped Run inspector does not answer the question a person opens it with: where did this run's time and money go? It opens empty until **Load activity** is pressed, labels every row and filter with a raw identifier such as `owner:01a0ac5a-…`, shows 100 identical owner rows, reads `0` for tokens it never measured and `not recorded` for the owner's model, and gives an empty box when a filter matches nothing (issue #535, audit frames `architect-froggerneon-inspector-*`). The approved prototype at `apps/styleguide/public/prototypes/architect-run-observability/` already shows the intended screen. This change builds that screen and records the data it needs.

## What Changes

- The inspector reads the run's activity when it opens. **Load activity** is removed.
- Owner activity is recorded as one `owner-wake` operation per owner turn. Each owner charge carries the owner's model, thinking level and token deltas and is attached to its wake, so owner cost shows as a few named wakes instead of 100 loose rows.
- Research and planning charges attach to their research or planning operation.
- Rows, filters and chart bars use names a person recognises: `Owner wake`, the research question, the Room or milestone title. A raw identifier appears only when no name was saved.
- The layout follows the prototype's Run inspector view: header with **Project**, a **Scope** selector (Project lifetime and each run) and **Live**; one row of summary tiles; a counter line; activity chips, a model selector and **Failures only**; an expandable timeline with an overview strip, ruler and zoom controls beside a selected-activity panel; then cumulative spend, cost by activity or model, and token composition charts; then the status legend.
- One headline cost. A filtered subtotal appears only while a filter is on, beside **Clear filters**. The aggregate-only share of the headline is stated in its tile instead of as a second unexplained total.
- A value that was not measured reads `unavailable`. `0` means a measured zero.
- A filter with no match says so, and **Failures only** with no failures says `No failures in this run.`
- The prototype's explanatory sentences and detail sub-headings are left out. Each figure keeps a short label; help text is not added.
- **Project lifetime** scope shows the per-run table and the cumulative spend across runs, and replaces the shared-activity entry in the old **View** selector.

Control mapping (every shipped control stays reachable or its removal is argued):

| Shipped control | After this change |
|---|---|
| Back to project | **Project** button, same behaviour |
| View selector | **Scope** selector; shared activity is part of Project lifetime |
| Owner and Room filter checkboxes | Activity chips (Owner, Research, Planning, Rooms, Workflows, Evaluation, Repair, Waits, Unassigned) and the model selector |
| failures only | **Failures only** toggle |
| Clear filters | Shown beside the filtered subtotal while any filter is on |
| Zoom in, Zoom out | Kept, plus **Zoom to selection** and the draggable overview window |
| Load activity | Removed: activity loads on open |
| Load more activity | Kept as the last row of the timeline while older pages exist |
| Row selection | Kept, with keyboard tree navigation |

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `architect-run-observability`: adds requirements for named activity, owner wakes as operations with model and tokens, loading activity on open, `unavailable` versus zero, one authoritative cost, and empty filter results.
- `architect-ui`: adds the requirement that the inspector follows the approved prototype layout with no explanatory copy.

## Impact

- `plugins/sero-architect-plugin/runtime/`: `owner-session.ts` (wake span, model and token deltas on owner charges), `project-usage.ts` (`recordCharge` carries parent, model, thinking and tokens), `services.ts` (research and planning charges get a parent), `trace-query.ts` (joins names from the project record, lifetime scope), `trace-summary.ts` (coverage and unknown counts for the tiles).
- `plugins/sero-architect-plugin/ui/components/Inspector*.tsx` and `ui/lib/{timeline,charts,trace,run-state,use-inspector-trace,page-helpers}.ts`: rebuilt to the prototype layout.
- Journals written before this change still read: loose owner charges fold under one `Owner` group per run, and missing names fall back to identifiers.
- No host, IPC or published package changes. `@sero-ai/common` types are read, not changed.
- Tests: `ui/__tests__/inspector.test.tsx`, `run-state.test.ts`, `runtime/__tests__/trace-query.test.ts`, `trace-summary.test.ts`.
