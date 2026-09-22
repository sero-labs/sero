## Why

When work finishes or stops, the user has to hunt for the result and the reason.
A stopped milestone prints "FOV raycasting + fog of war stopped before it finished"
four times, and never says why. A finished Room lists file ids instead of showing
the plan it produced. A member's Info tab opens on its instructions rather than on
its model, tools, access and spend. Three of the facts the user needs are not on
the page at all, or are wrong: the saved stop reason, the artifact's headings, and
an over-limit member that still reads as healthy.

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/3-read-the-outcome.html`.
Its four frames and its Decisions are binding.

## What Changes

- **A Workflow's ending becomes one Result row above the settings.** The saved
  `runtime.completion.reason` is shown there for every ending, in place of the
  `Stopped (status):` card. The objective is said once, and the request that
  started the Workflow opens from it, folded, for every Workflow.
- **A stopped milestone states the saved reason once.** The header says what
  stopped and why, with Retry step beside it. The reason comes from the run's own
  record rather than from a sentence the Architect writes without knowing it.
- **A passed milestone's evidence reads as a list of checks**, each command's
  output opening from its own row.
- **A Room's result leads with the result and then the final plan**, open at its
  first section with the author's other sections folded. Duration and spend are
  said once, in the header, with the cost breakdown's own total the one exception.
  Cost by member is folded and shows full names. Delete Room moves into the ⋯ menu.
- **A member's Info tab leads with model, tools, access and spend.** Working
  instructions open from the mandate. Turns, tokens, retries, compactions and
  skills move into a Usage fold. "No worktree" joins Access.
- **The run record keeps why a run ended and where it stopped.** The per-run
  summary gains the run's block and the steps a restart left in flight, and a step
  an interruption left in flight stops reading as completed. The field applies from
  now on; a run that already ended keeps the summary it was written with.
  **BREAKING** for consumers that read `runs/index.json`: the shape gains two
  optional fields and one step status changes meaning.
- **A published artifact keeps the line breaks its author wrote.** Content whose
  line breaks the command surface escaped is stored as its author wrote it, and a
  reader sees the headings, paragraphs and lists of an artifact already on disk
  without the file being rewritten.
- **An over-limit member reads as a fault**, by the same rule a project and a Room
  already use.

## Capabilities

### New Capabilities

- `orchestrator-run-record`: what a Workflow's per-run summary retains about why the
  run ended and which steps it was on, so a reader can say what happened without
  reconstructing it.
- `room-artifacts`: how a published Room artifact's content is stored and read back,
  so a reader sees the headings, paragraphs and lists the author wrote.

### Modified Capabilities

- `orchestrator-ui`: the Workflow page gains a Result row for every ending and a
  request fold under the objective; the Room result view gains the result, the
  inline final plan and a folded cost table; the member Info tab is reorganised;
  a Room's Delete control moves into the ⋯ menu.
- `architect-ui`: the project header states what stopped and why once, with the
  whole recovery control beside it, and the milestone rail stops repeating that
  control; a milestone's evidence reads as a list of checks with each command's
  output behind its own row.
- `architect-project-record`: a milestone's dispatch records why the delegated
  work stopped, taken from the run's own record.

## Impact

- Orchestrator: `runtime/store.ts`, `shared/index-types.ts`,
  `runtime/rooms/room-work.ts`, `runtime/rooms/room-app-actions.ts`,
  `extension/room-app.ts`, `extension/room-commands.ts`,
  `ui/components/LoopDetail.tsx`, `PlanPresentation.tsx`, `RoomCompletion.tsx`,
  `RoomTopBar.tsx`, `RoomMemberFacts.tsx`, `RoomMemberPanel.tsx`, `RoomRoster.tsx`,
  and new UI for reading and folding an artifact.
- Architect: `runtime/run-health.ts`, `runtime/dispatch-watch.ts`,
  `shared/activity.ts`, `ui/components/StateLine.tsx`, `MilestoneRail.tsx`,
  `ProjectPage.tsx`, `ui/lib/view-model.ts`.
- `runs/index.json` gains two optional fields. Consumers must tolerate their
  absence, and a record written earlier is read as retaining no cause.
- `runtime/rooms/room-app-actions.ts` is at 491 of the 500-line source cap and must
  be split before it takes another export.
- Non-goals: the History entries' copies of the stop sentence (#539), the Room
  header's meters, the Workflows and Rooms list rows, and the plan map.
