## Why

Issue #581. The only place that shows what a running subagent does is Explorer › Orchestration, far from the Workflow step, Room, chat or screen that started it. Room Watch tiles look live but do not stream: they re-read a snapshot only when the Room record changes. The main process also sends every subagent's text to every window every 200 ms, even when no view shows it.

## What Changes

- A running agent shows its live progress on the thing that started it: one line naming what it does now with a timer, then the last lines it wrote. The same live block is used everywhere.
- Workflow steps: the live block is closed by default and opens from an eye control on a running step. A failed step carries Retry in its header and states its error on one line under the title.
- Orchestrator one-answer calls get the same eye: the planner wait (Workflow plan, Room design, Room rethink, Catalog install, answering the planner's questions), Reflect and Skill in the Workflow top bar, Refine plan, the checks between steps (result, recovery, stop condition), and the check on a newly arrived event. Their text is the raw reply as the model writes it.
- Room Watch tiles stream each live member's text. A member that starts subagents lists each child with what it does now. A waiting or finished member shows the end of its last reply, dimmed, in place of the fixed sentence.
- The chat `subagent` tool call shows one live block per agent while it runs.
- Architect research run directly as one agent is shown while it runs, on the research card and in the activity line, with the eye. Today it is shown nowhere on the project page.
- Design Library's pending tile gets the eye while a reference is generated.
- A host live watch: a view opens it when the live block is visible and closes it when hidden. The main process sends live text and tool activity only for watched runs and member sessions, and limits the send rate per run. Start and end events still go to every window.
- **BREAKING** Explorer › Orchestration is removed, with its activity bar item, running-count badge, Clear completed and total line. The `window.sero.subagent` events and snapshot stay. The Research plugin (external checkout) reads them and must open a watch for the runs it shows.
- No per-run Stop and no stall warning. Workflow Stop, Room Pause and chat Stop still end these runs.

## Capabilities

### New Capabilities
- `live-agent-watch`: the live block, the visible-only host watch, and where it appears: Workflow steps and one-answer calls, Room Watch tiles, chat subagent calls, Design Library generation; removal of Explorer › Orchestration.

### Modified Capabilities
- `orchestrator-ui`: a step's live view and its failed layout; the planner wait gains the eye and covers Catalog install and answering the planner's questions; the approved-drawing rule admits the eye from the new prototype.
- `architect-ui`: the project page may stream a research agent's output when the user opens it; direct research is shown while it runs.

## Impact

- Visual spec: `apps/styleguide/public/prototypes/live-agent-progress.html`.
- Desktop: subagent tracker and IPC (`apps/desktop/electron/features/subagent/`, `electron/ipc/subagent/subagent.ts`), preload and `src/types/ipc.ts` for the watch; persistent-session live stream to the renderer through the Room grant; chat tool-call rendering (`src/components/layout/tool-call-helpers/`); Explorer panel files, `ActivityBar.tsx`, `ExplorerSidebar.tsx`, `lib/explorer-panels.ts`, `stores/subagent.ts`.
- `@sero-ai/common` (published): watch types; version bump.
- Orchestrator plugin: host adapter forwards `onObservation`; step attempts and one-answer calls save their tracker run id (`workerRunId` and the planning or auxiliary record); StepCard, PlannerWait, RefinePlan, LoopDetail, SkillDraftControl, LoopStateLine, RoomWatch and room-view.
- Architect plugin: `ProjectResearch.tsx` and the activity line in `ui/lib/view-model.ts`; research run id saved on the pending research.
- Design Library plugin: `PendingItemTile.tsx`; generation run id saved on the pending job.
- External: `sero-research-plugin` opens a watch for its agents.
