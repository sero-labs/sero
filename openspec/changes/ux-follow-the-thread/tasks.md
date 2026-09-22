## 1. Creation context carries the project's display name

- [ ] 1.1 Add an optional display name to `OrchestratorProjectContext` in `packages/common/src/orchestrator-project-context.ts`, and verify `pnpm typecheck` passes with no other change.
- [ ] 1.2 Fill the name from `record.name` in `resolveProjectContext` (`plugins/sero-architect-plugin/runtime/model-resolution.ts`), and verify the existing model-resolution and dispatch-link tests pass, with one new case asserting the name is retained through `buildDraftLoop` and that `sameOrchestratorProjectAttribution` still compares only `projectId` and `runId`.

## 2. A launched Workflow or Room replaces its history entry

- [ ] 2.1 Pass `{ replace: true }` on the Orchestrator's mount-time launch, its first-mount shell location, and its plugin-state restore in `plugins/sero-orchestrator-plugin/ui/lib/orchestrator-navigation.ts`, mirroring `useArchitectView`. Verify with `ui/__tests__/orchestrator-navigation-hook.test.tsx` that a mount-time launch leaves exactly one history entry for the app and that `host.navigate` was called with `replace`.

## 3. A workspace switch records a step

- [ ] 3.1 Add `switchWorkspace(workspaceId)` beside `navigateBack` in `apps/desktop/src/lib/open-app.ts`: push the active app's location in the new workspace (`appViewIds[app]?.[workspaceId]`), then call `setActiveWorkspace`. Verify with a new case in `apps/desktop/src/lib/open-app.test.ts` that it appends one entry carrying the new workspace and does nothing when the workspace is already active.
- [ ] 3.2 Use it at the three same-app switch sites: `WorkspaceNode.tsx` `handleHeaderClick` and `handleNewSession`, and `setActiveSession` in `apps/desktop/src/stores/sessions.ts`. Verify a sidebar switch from a Workflow page leaves the previous entry unchanged and adds one for the new workspace.
- [ ] 3.3 Delete `listenForAppNavigationWorkspace` from `apps/desktop/src/stores/app/listeners.ts`, its re-export, and its subscription in `apps/desktop/src/App.tsx`. Replace the listener test in `open-app.test.ts` with one asserting the sidebar switch pushes while a history restore does not. Verify the desktop store suites pass.
- [ ] 3.4 Remove the `replaceCurrent(target.entry)` compensation from `navigate()` in `open-app.ts`. Verify a Back that crosses a workspace lands on the exact earlier entry and leaves the places already visited unchanged.

## 4. Back and Forward name the workspace they land in

- [ ] 4.1 In `apps/desktop/src/components/layout/titlebar/NavButtons.tsx`, resolve the landing workspace's name from `useWorkspaceStore`, falling back to the active workspace's name when the target entry has none, and format `Back to <app> · <workspace>` and `Forward to <app> · <workspace>`. Verify a new `NavButtons.test.tsx` covers a global target (`Back to Architect · DungeonExplorer`), a target in another workspace (`Back to Sero Orchestrator · FroggerNeon`), and a target in the current workspace.

## 5. Workflows and Rooms name their Architect project

- [ ] 5.1 In `plugins/sero-orchestrator-plugin/ui/lib/loop-settings.ts`, expose the originating project's name and link target from `loop.project` only when the name exists. Verify a unit test covers a named project, a record with an id but no name, and no project.
- [ ] 5.2 Render `FROM` first in `ui/components/LoopSettingsLine.tsx`, opening the project with `openSeroApp(ARCHITECT_APP_ID, { projectId })` and using the existing dotted-underline value style. Verify `loop-settings-line.test.tsx` covers the named, unnamed and absent cases and that every value the line shows today is still present.
- [ ] 5.3 In `ui/components/RoomTopBar.tsx`, name the project beside the state pill when `room.definition.projectContext` carries a name, linking to it in Architect. Verify a new `room-top-bar-project.test.tsx` covers a named and an unnamed Room, and that the name is shown while the Room is on hold without duplicating the hold's actions.
- [ ] 5.4 Add project context to the loop and Room used by `ui/__preview__/fixture.ts` and `ui/__preview__/read-the-outcome-fixture.tsx`. Verify the `loop-ending` and `room-result` previews render the `FROM` value and the project link.

## 6. Evidence

- [ ] 6.1 Add `apps/desktop/e2e/navigation.workflow.spec.ts`, seeding a copied profile with a workspace, one Architect project, one dispatched Workflow and one dispatched Room, and asserting: Open in Orchestrator then Back once lands on the project; Open Room then Back once lands on the project; a sidebar workspace switch then Back once lands on the page left. Verify the spec passes with the app runtimes off.
- [ ] 6.2 Capture the drawing's three frames from `6-follow-the-thread.html` and the built surfaces through `pnpm --filter @sero-ai/plugin-orchestrator preview` at a viewport wider than the panel, opening every fold, chevron and Tune panel on both sides, and read them side by side. Verify each captured surface was read as an image before any difference was recorded.
- [ ] 6.3 Write `comparison.md` with the capture method, each difference the captures showed and what was done about it, and the departures taken knowingly: `CONTEXT` kept so the settings row has one more value than frame 1; the workspace suffix shown on every Back, including one the drawing never shows; the project name being a snapshot that can go stale after a rename. Name any frame that was never compared.

## 7. Checks

- [ ] 7.1 Run `pnpm typecheck` from the monorepo root and confirm no errors in the renderer or the Electron main process.
- [ ] 7.2 Run the touched unit suites (desktop stores and titlebar, the Orchestrator `ui/__tests__` suites) and the new navigation spec, and record the result before review.
