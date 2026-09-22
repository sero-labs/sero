## Why

History is unreadable. Entries print raw ids (`loop_200ac871-…`, `dec_p5pq0ezs`),
a ninety-nine word note prints whole, and the rail holds the right third of the
project page on every visit. A stopped run says `Blocked` and never says why. A
Workflow's run rows name steps by id, and reflection repeats a lesson it already
holds.

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/4-history-and-comparison.html`.
Its three frames and its Decisions are binding.

## What Changes

- **Architect History becomes its own view**, opened from the project controls
  menu. It is a centred timeline with the count and date range in its header
  ("30 changes · 8 Sep – 10 Sep"), day headings, a dot for a block, a question or
  an accepted milestone, a link from an entry to the Workflow or evidence it
  names, and "Show earlier" for older entries. History leaves the project page's
  right rail, which keeps the older-directives disclosure. Every entry is kept.
- **A History entry saves what it is about** and keeps its long note separate from
  its headline. The milestone, Workflow, Room or decision is saved with its id and
  its name, so the view names and links the subject without parsing a sentence. An
  entry records the note that folds under it. Entries written before this change
  keep their text unchanged.
- **A Room's publish row names the artifact and opens it.** The promoted card
  stops showing only the file name; the event's own line carries the title and an
  `Open` control. The separate file-name row goes.
- **A Room's activity filters and its side-panel tabs show what each holds**, and
  a tab holding nothing shows `0` and stays usable. The `All` filter still shows
  every event.
- **A Room's brief ends at its last item.** The paragraph that explains how the
  brief is built leaves the brief.
- **A Workflow's run rows name their steps.** Each visited step is shown by its
  title in plan order, not by its step id. The run's summary retains each visited
  step's title so the row needs no other file.
- **A stopped run states its saved reason.** The run row prints the run's own
  recorded reason, such as "Stopped at the $3 spend limit", in place of the word
  `Blocked`.
- **Reflection adds only a lesson it does not already hold.** It receives its
  existing lessons and the model does the comparison; no string matching.

## Capabilities

### New Capabilities

- `orchestrator-reflection`: how a Workflow's reflection pass turns its own run
  history into durable lessons and suggested changes, and what it must not repeat.

### Modified Capabilities

- `architect-project-record`: a history entry records what it is about, with the
  subject's kind, id and name, and keeps its long note apart from its headline, so
  the view names and links the subject without parsing.
- `architect-ui`: History is its own view opened from the project controls menu;
  the project page drops the History disclosure from its right rail; the
  collapsed-history layout preference goes with it.
- `orchestrator-run-record`: a run's per-step summary retains each visited step's
  title, so a reader names a step without reading the current plan.
- `orchestrator-ui`: the Room's publish row names and opens its artifact; activity
  filters and side-panel tabs show their counts and an empty tab stays usable; the
  brief ends at its last item; a run row names its steps by title and prints the
  run's saved stop reason.

## Impact

- Architect: `shared/record.ts`, `shared/lifecycle.ts`, `runtime/owner-actions.ts`,
  `runtime/projects-actions.ts`, `runtime/dispatch-link.ts`,
  `runtime/repair-dispatch.ts`, `runtime/run-health.ts`,
  `runtime/research-room.ts`, `runtime/research-workflow.ts`,
  `runtime/research-access.ts`, `runtime/services.ts`,
  `ui/components/SideColumn.tsx`, `ui/components/TopBar.tsx`, `ProjectPage.tsx`,
  `ArchitectApp.tsx`, `ui/lib/navigation.ts`, `ui/lib/page-helpers.ts`, and new UI
  for the History view.
- Orchestrator: `runtime/store.ts`, `shared/index-types.ts`,
  `runtime/reflection.ts`, `ui/components/RoomActivity.tsx`,
  `ui/components/RoomSidePanel.tsx`, `ui/components/AttemptHistory.tsx`,
  `ui/lib/run-summary.ts`.
- `HistoryEntry` gains two optional fields. A record written earlier loads
  unchanged, and its entries keep the text they were written with.
- `LoopRunStepSummary` gains one optional field. A run summary written earlier
  keeps loading, and its steps fall back to the step id.
- Non-goals: rewriting the entries a record already holds, the Room header's
  meters, the Workflows and Rooms list rows, and the plan map.
