## 1. Host: subagent watch and per-run throttle

- [x] 1.1 Add `watch(runId)` / `unwatch(runId)` to the subagent bridge across `src/types/ipc.ts`, `ipc-channels.ts`, preload and the main-process handler, reference-counted per window and dropped when the window is destroyed (D1); verify with a main-process test that live text reaches only the watching window
- [x] 1.2 Replace the shared live-text and tool-activity throttles with one timer per run id, cleared on end (D2); verify with a test where two runs write at once and both deliver updates
- [x] 1.3 Add optional `toolCallId` to `SubagentEntry` and pass it from the `subagent` tool's `execute` through single, parallel and chain runs; verify the tracker entry carries it
- [x] 1.4 Keep start, progress and end events broadcast to every window; verify an unwatched run still reports start and end

## 2. Host: runtime-to-UI events

- [x] 2.1 Add `ctx.host.ui.emit(topic, payload)` for app runtimes and `useAppRuntimeEvents(topic, handler)` in `@sero-ai/app-runtime`, scoped to the app's views in the workspace (D3); verify with a test that another app does not receive the event
- [x] 2.2 Bump `@sero-ai/common` and `@sero-ai/app-runtime` versions; verify `pnpm typecheck` passes

## 3. Shared live block

- [x] 3.1 Build the live block (doing-now line with timer, text tail with newest line in view, optional agent name, fixed-width variant for raw replies) to match the prototype; verify against a screenshot of the prototype at the same size
- [x] 3.2 Make the block open a watch when shown and close it when hidden or unmounted; verify no live events arrive for a closed block

## 4. Orchestrator: run ids

- [x] 4.1 Forward `onObservation` in the host adapter and write `StepAttempt.workerRunId` from the first observation through `onAttempt` (D4); verify a running attempt in state holds the tracker run id
- [x] 4.2 Add an `onRunId` path to `runTrackedModel` and record a `liveCall` `{ kind, runId, stepId?, label? }` on the loop runtime for planner, trigger extraction, refine, reflect, skill, evaluator, recovery, stop condition and event condition, cleared on return; verify each call writes and clears it
- [x] 4.3 Record the run id on the Room pending planning entry and on `room.runtime` while adjusting; verify both during a stubbed planner call

## 5. Orchestrator: UI

- [x] 5.1 StepCard: eye control on running model and background-agent steps, closed by default; `checking the result` / recovery / stop-condition blocks while the step stays Running; one block per running fan-out item; no control on active-session steps; verify each state in a component test
- [x] 5.2 StepCard failed layout: Retry in the header beside Failed, error on one line under the title with no label column; verify against the prototype's Failed state
- [x] 5.3 PlannerWait: eye beside the timer, block under it; show the planner wait for Catalog install and for re-planning after the user answers planner questions; verify the three existing titles and the two new entry points
- [x] 5.4 LoopDetail top bar: `Reflecting…` and `Preparing skill…` with spinner and an eye that opens a pop-up block, Escape closes; RefinePlan: eye beside the rewriting line; verify keyboard open and close
- [x] 5.5 LoopStateLine: `checking a new event: <label>` with eye while an event condition runs; verify with a stubbed `liveCall`
- [x] 5.6 Room runtime: emit member live events through `ctx.host.ui.emit` while a Watch lease is held, throttled per member; RoomWatch subscribes and streams; verify a tile updates mid-turn without a Room record change
- [x] 5.7 RoomWatch: list a member's child subagents by `parentSessionId` with their current tool and time; verify with two stubbed child entries
- [x] 5.8 RoomWatch: waiting and finished tiles show the end of the last reply from `history`, dimmed, no caret; remove the fixed sentences from `memberPaneText`; verify both states

## 6. Chat

- [x] 6.1 The chat `subagent` tool call shows one live block per agent (matched by `toolCallId`) in place of the start lines while running, and the normal input and output when done; verify single, parallel and chain calls

## 7. Architect

- [x] 7.1 Save the tracker run id on the pending research entry for direct research
- [x] 7.2 ProjectResearch shows direct research while it runs (question, stopping condition, `Researching` with elapsed time, eye) and keeps its findings after it ends; the activity line reads `Researching a project question`; verify both scenarios in `architect-ui`

## 8. Design Library

- [x] 8.1 Save the tracker run id on the pending generation job; PendingItemTile offers the eye and shows the block in place of the spinner; verify open and close restore the spinner

## 9. Explorer removal

- [x] 9.1 Delete `explorer/orchestration/`, the activity bar item and badge, and `orchestration` from `BUILTIN_EXPLORER_PANELS`; map a saved `orchestration` panel id to `explorer` when the layout is read (D6); verify a layout file holding `orchestration` opens on Explorer
- [x] 9.2 Remove the stale Orchestration comment in `stores/user-feedback-store.ts`; verify no reference to `OrchestrationPanel` remains with a search

## 10. External plugin and checks

- [x] 10.1 `sero-research-plugin`: call `watch`/`unwatch` for the agents it shows, with a feature check for older hosts (D7); verify its activity panel still streams
- [x] 10.2 Run `pnpm typecheck --force` and the affected test suites from the monorepo root; verify zero errors
- [ ] 10.3 Manual pass in the app: open and close each live view and confirm with the main-process log that live events stop while hidden
