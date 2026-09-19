## 1. Shared vocabulary and liveness contract

- [ ] 1.1 Add `packages/common/src/activity-state.ts` with the nine state ids, their word, glyph id and next-step sentence builder, plus the `isLive(mark, session)` predicate; export from the package index and verify a new unit test covers every state having a word and a distinct glyph id
- [ ] 1.2 Add the liveness mark to the loop index contract in `packages/common/src/orchestrator-contract.ts` (`liveRun?: { runId, startedAt, reportedAt }` on the loop summary and board view) and verify `pnpm typecheck` passes with the existing board consumers unchanged
- [ ] 1.3 Add `{ kind: 'set_armed'; loopId; armed; triggerIds? }` to `OrchestratorBoardAction` and the `orchestrator` tool's action list, and verify the type union rejects an unknown kind at build time

## 2. Orchestrator: honest liveness and arming

- [ ] 2.1 Write `liveRun` into the loop index from the coordinator's in-memory running map when a run starts and reports, and clear it when the run ends; verify with a coordinator test that the mark appears only while the map holds the loop
- [ ] 2.2 Clear every `liveRun` mark in `runtime/reconcile.ts` at startup and verify `runtime/__tests__/reconcile.test.ts` gains a case proving an orphaned mark from an earlier session does not read as live
- [ ] 2.3 Implement `set_armed` in the runtime: set `LoopTrigger.disabled` for the named triggers (all of them when none are named), leave `activeRunId` and any in-flight run untouched, and reject a loop the caller did not create; verify with runtime tests for disarm-with-run-in-flight, re-arm, and the foreign-loop rejection
- [ ] 2.4 Derive the Workflow state word from the shared vocabulary in one place (`ui/lib/loop-card.ts` and `ui/lib/status-style.ts`), covering working, queued, waiting-for-trigger, waiting-for-you, paused, complete, stopped and last-known, and verify a unit test maps each record shape to the expected word

## 3. Orchestrator surfaces

- [ ] 3.1 Replace Home's `runningLoops + runningRooms + activeGoals` count with the shared derivation, and verify a test shows Home counts nothing active for a Workflow the Workflows list calls `Waiting for a trigger`
- [ ] 3.2 Rebuild Home's opening: one status line, then Needs you; move the three create cards to header buttons with one "What are these?" disclosure; drop counts already on the tabs; verify a component test asserts the header buttons exist, the explainer cards are gone and no tab count is repeated
- [ ] 3.3 Group Needs you items by their Workflow or Room, printing the name once with each item keeping its Review action, and verify a test with three suggested changes on one Workflow asserts one name, three rows and a count of three
- [ ] 3.4 Make the Workflows tab a full-width list: full titles, the state word, what it waits for, last run and spend; remove the detail pane and its "Select a Workflow from the list." placeholder; verify a component test asserts a long title renders whole and the placeholder string is absent
- [ ] 3.5 Render the Workflow on its own page when `view.loopId` is set, with a "← Workflows" link back to the list, reusing today's detail content and the existing `workflows/<loopId>` view id; verify navigation tests cover open, back, and restoring the list's search text
- [ ] 3.6 Rework the Rooms row to lead with the state word, the ask and how long it has waited, move the brief off the row and keep member avatars and count; verify a component test on a Room paused nine days ago asserts the waiting sentence and that the brief is not the summary line
- [ ] 3.7 Split any file this group takes over 500 LOC (watch `HomeView.tsx` and `OrchestratorApp.tsx`) and verify each changed source file is at or below the cap

## 4. Architect record and liveness

- [ ] 4.1 Add `activity` to `ArchitectIndexEntry` and `runtime: { running, startedAt }` to the index; keep `stateLine` on the project record only; verify the shared types compile and `shared/__tests__` covers the new shapes
- [ ] 4.2 Write the runtime flag from the Architect extension at activation, `running: true` when the kill switch allows the runtime and `running: false` when it does not, and `false` again at shutdown; verify a test asserts both activation paths write the flag
- [ ] 4.3 Stamp `MilestoneDispatch.observedLiveAt` in `runtime/dispatch-watch.ts` when a watched index reports a live run, and clear every saved stamp when the runtime starts; verify `runtime/__tests__/dispatch-watch.test.ts` covers stamp-on-report and clear-on-start
- [ ] 4.4 Derive `activity` from the record and the watched indexes instead of writing a sentence in `runtime/dispatch-link.ts`, covering working, waiting-for-trigger, waiting-for-you, paused, idle, complete, stopped and last-known with the owner line and the needed action; verify a table-driven unit test maps each project shape to its expected state, owner line and action
- [ ] 4.5 Verify with a regression test that a milestone saved as `running` whose dispatch has no observed report derives `last-known` with the saved report time, never `working`

## 5. Architect pause and maintenance

- [ ] 5.1 On pause, disarm the maintenance Workflow's triggers through `set_armed` and record the disarmed trigger ids on `MilestoneDispatch.disarmedTriggerIds`; verify `runtime/__tests__/projects-actions.test.ts` asserts the action was sent and the ids were saved
- [ ] 5.2 On resume, re-arm exactly the recorded trigger ids and clear them from the record; verify a test where the user had already disarmed one trigger by hand proves that trigger stays off
- [ ] 5.3 Verify with a test that pausing a project with a run in flight leaves that run running, keeping the existing pause guarantee

## 6. Architect surfaces

- [ ] 6.1 Rebuild the projects-list row around the derived activity: state line, owner line, the needed action and spend, with no written sentence and no project id; verify a component test asserts the two lines and that no raw record id appears
- [ ] 6.2 Add the `Needs you · N` filter to the projects list and verify a test asserts the count equals the number of rows shown when the filter is on
- [ ] 6.3 Show the "Architect is not running in this session" notice at the top of the list with no dismiss, and fall the affected rows back to `Last known` while stopped, paused and complete stay as saved; verify a component test covers both row kinds with the flag off
- [ ] 6.4 Rework the project header: the state in plain words as the heading, the same activity line, one action button only when something needs the user, and Retry step lifted to the header for a stopped step; verify `ui/__tests__/project-controls.test.tsx` and `milestone-rail.test.tsx` cover the header retry calling the same action as the rail
- [ ] 6.5 Put the Architect's own sentence complete behind "What Architect reported" with its time, and verify a test asserts the full text is present and is not used as the heading
- [ ] 6.6 Update the dashboard widget to the derived state word and verify `ui/__tests__/navigation-and-widget.test.ts` asserts the widget and the list agree for a `Last known` project
- [ ] 6.7 Split any file this group takes over 500 LOC (watch `StateLine.tsx` and `ProjectsList.tsx`) and verify each changed source file is at or below the cap

## 7. Workspace tree

- [ ] 7.1 Add a typed Architect index view to `@sero-ai/common` for the fields the shell needs (`workspaceId`, `activity.state`, the action sentence) and verify the plugin's own type is assignable to it
- [ ] 7.2 Watch the Architect index alongside the Agent Board store's Orchestrator watches and expose a per-workspace attention selector, showing nothing when a record cannot be read; verify a store test covers a waiting Room, a stopped Workflow, both at once giving one icon, and unreadable records
- [ ] 7.3 Render one icon beside the workspace name in `WorkspaceNode` with the reason on hover and keyboard focus in the owning app's words; verify a component test asserts the icon's presence, its absence when nothing needs the user, and that the reason is reachable by focus

## 8. Checks and evidence

- [ ] 8.1 Run `pnpm typecheck` from the repo root and verify it passes for the renderer, the Electron main process and both plugins
- [ ] 8.2 Run the Architect, Orchestrator and desktop test suites and verify they pass
- [ ] 8.3 Check every new state on the four surfaces with reduced motion enabled and with colour ignored, and verify each state still reads as a word with its glyph
- [ ] 8.4 Screenshot the projects list, the project header, Orchestrator Home, the Workflows list and page, the Rooms list and the workspace tree against the approved drawings, and record any deliberate departure on issue #536
