# Refactoring Plan — plugins/sero-signal-desk-plugin

_Plan drafted: 2026-05-03_

## Executive Summary
`plugins/sero-signal-desk-plugin/` has a solid product idea and the packaging basics are mostly correct: the manifest, AD-020 tool registration, relative production MF build, prompt/skill resources, and shared parsing/clustering helpers are in place, and package-local tests/typecheck/build all pass. The main problems are not dependency setup; they are Sero maintainability and runtime truthfulness. Two UI source files violate the 500-LOC cap, extension state reads can silently reset user data after malformed JSON, and the UI duplicates many of the same state mutations that the `signal_desk` tool already owns. The target state is a smaller component/runtime split, fail-loud state I/O, one canonical action path for domain mutations, and a truthful decision about whether the background runtime actually schedules refreshes.

## Issues Found (prioritized)
- **High** — Source files exceed Sero’s hard 500-LOC cap — `plugins/sero-signal-desk-plugin/ui/SignalDeskApp.tsx:1` is 729 LOC and `plugins/sero-signal-desk-plugin/ui/styles.css:1` is 1,345 LOC. This violates the monorepo/plugin file-size rule and makes the highest-change surface difficult to review. `SignalDeskApp.tsx` currently owns bridge typing, state watching, optimistic writes, tool invocation, CRUD handlers, guide content, stream rendering, briefing rendering, settings rendering, and handoff prompts in one file. Effort: **M**.

- **High** — Extension state reads fail open on every error — `plugins/sero-signal-desk-plugin/extension/index.ts:89-95` catches all read/parse failures and returns `DEFAULT_STATE`. If `.sero/apps/signal-desk/state.json` is malformed, truncated, or temporarily unreadable, the next mutation writes a fresh empty state and can erase sources, articles, clusters, insights, and actions. Sero has already fixed this pattern in other plugins; first-run missing files should default, malformed/unreadable files should fail loud with repair guidance. Effort: **S**.

- **High** — UI duplicates canonical `signal_desk` tool mutations and already diverges — `plugins/sero-signal-desk-plugin/ui/SignalDeskApp.tsx:121-135` writes directly through `window.sero.appState`, then `ui/SignalDeskApp.tsx:181-280` implements source/watchlist/status/insight/action mutations locally. The extension already owns the corresponding actions in `plugins/sero-signal-desk-plugin/extension/index.ts:205-335`. The divergence is concrete: UI `removeSource` at `ui/SignalDeskApp.tsx:235` filters clusters against the old article list and does not recluster, while extension `remove_source` at `extension/index.ts:220-225` removes source references, deletes related articles, and reclusters. This undermines the plugin rule that UI-triggered plugin behavior should go through plugin-owned tools and makes UI/agent/CLI state semantics drift. Effort: **M**.

- **Medium** — The federated UI redeclares Sero host/app-runtime contracts — `plugins/sero-signal-desk-plugin/ui/SignalDeskApp.tsx:14-37` defines local `AppContextValue`, `SeroGlobal`, and `window.sero` types instead of consuming `@sero-ai/app-runtime` hooks/contracts. `README.md:46-50` explains the duplicate-React workaround, so this is understandable, but it trades one runtime issue for long-term type drift: changes to `AppToolResult`, app context, or app-state watch contracts will not fail this plugin at compile time. Effort: **M**.

- **Medium** — Background runtime advertises scheduled refresh orchestration but only sets a no-op timer — `plugins/sero-signal-desk-plugin/package.json:41` declares `runtime`, `package.json:54` requires `appRuntime.background`, and `runtime/index.ts:36-47` configures `setInterval(...)` when `refreshIntervalMinutes` is set. The callback does not invoke a tool, update state, or record a run. This is a runtime-truthfulness issue: if the setting is enabled later, users will believe refresh is scheduled when nothing happens. Effort: **S/M** depending on chosen behavior.

- **Medium** — UI editing uses blocking native prompts and unchecked casts — `plugins/sero-signal-desk-plugin/ui/SignalDeskApp.tsx:225-232`, `ui/SignalDeskApp.tsx:236-242`, `ui/SignalDeskApp.tsx:252-258`, and `ui/SignalDeskApp.tsx:260-271` use `window.prompt(...)` for core editing flows and cast prompt strings into `Watchlist['type']`, `Watchlist['priority']`, and action priorities. This bypasses Sero’s normal dialog/form interaction language, has weak validation, and is hard to test. Effort: **M**.

- **Medium** — Largest behavior surfaces have no direct tests — package-local tests cover shared helpers and manifest shape, but not `ui/SignalDeskApp.tsx:101-166` watch/write/tool behavior, UI CRUD divergence, `extension/index.ts:89-103` state I/O, or `runtime/index.ts:19-47` reconciliation/timer behavior. For a plugin centered on persisted state and external feeds, the missing coverage is exactly around data-loss and UI/agent parity risks. Effort: **M**.

- **Low** — Small dead/polish leftovers reduce confidence — `plugins/sero-signal-desk-plugin/ui/SignalDeskApp.tsx:2` imports `dailyDigest` without using it, and helper functions like `watchlistNames` at `ui/SignalDeskApp.tsx:61-63` are also unused. The package passes because `noUnusedLocals` is not enabled. Effort: **S**.

## Proposed Refactoring
1. **Split the UI immediately to clear the 500-LOC violation.**
   - Keep `ui/SignalDeskApp.tsx` as a thin composition shell, ideally under ~180 LOC.
   - Target structure:
     - `ui/runtime/sero-bridge.ts` — one owner for app context, app-state watch/write, and app-tool invocation. If `@sero-ai/app-runtime` cannot be used directly yet, keep the workaround isolated and typed against the closest shared contracts.
     - `ui/runtime/useSignalDeskState.ts` or class-compatible controller equivalent — state hydration, optimistic write, busy state, and command wrappers.
     - `ui/components/WatchRail.tsx`, `StreamView.tsx`, `BriefingDesk.tsx`, `BriefingPanel.tsx`, `InsightsPanel.tsx`, `ActionsPanel.tsx`, `SettingsPanel.tsx`, `HelpGuide.tsx`.
     - `ui/lib/formatting.ts` for `formatDate`, `sourceName`, and small derived helpers.
   - Split `ui/styles.css` by the same ownership boundaries, for example `ui/styles/base.css`, `layout.css`, `watch-rail.css`, `stream.css`, `briefing.css`, `settings.css`, and `guide.css`, then import them from one `styles.css` entrypoint so MF CSS shipping behavior remains unchanged.

2. **Harden state I/O before adding more actions.**
   - Extract `extension/state-io.ts` with `readSignalDeskState()` and `writeSignalDeskState()`.
   - Default only on `ENOENT` / first-run missing files.
   - On malformed JSON, permission errors, or other read failures, return an error-shaped tool response that includes the state path and repair guidance instead of writing defaults.
   - Keep the existing temp-file + rename write pattern.
   - Add tests for missing file, malformed JSON, unreadable file if practical, and successful atomic write.

3. **Converge UI mutations on one plugin-owned action path.**
   - Decide which mutations are truly presentation-only (`ui.activeView`, selected IDs, search query) and keep those as direct app-state writes if desired.
   - Move domain mutations through `signal_desk` via `appAgent.invokeTool(...)`: add/update/remove source, add/update/remove watchlist, mark article/cluster, save insight, create action, update action status, and seed demo.
   - Add missing extension actions if the UI needs richer update behavior (`update_action`, `update_insight`, `delete_insight`, `mark_all_seen`, maybe `settings_update`).
   - After tool execution, let the app-state watcher hydrate the UI from the canonical state file rather than reimplementing reducer semantics in React.
   - This aligns the plugin with AD-020 and with the generic app-tool bridge added for external plugin UIs.

4. **Either implement scheduled refresh or remove the background runtime claim.**
   - If scheduled refresh is in scope:
     - runtime should call the canonical refresh path through an approved host/runtime capability, or move refresh orchestration into a runtime-owned helper shared with the extension without making the extension Pi-unsafe;
     - every scheduled run should append/update a `RefreshRun` with success/partial/error semantics identical to manual refresh;
     - add runtime tests with fake timers.
   - If scheduled refresh is not in scope yet:
     - remove `refreshIntervalMinutes` or keep it hidden and inert with explicit docs;
     - drop `runtime` / `appRuntime.background` until there is real background work, or keep only startup reconciliation with no interval.
   - Do not leave a no-op `setInterval` in production code.

5. **Replace prompt-based editors with real plugin UI forms.**
   - Start with watchlist/source editing because those are the highest-frequency settings flows.
   - Use inline panels or lightweight dialog components local to the plugin UI instead of `window.prompt`.
   - Validate enum values from controlled selects instead of string casts.
   - Reuse the same tool-backed action path from step 3 so UI validation and extension validation stay aligned.

6. **Add targeted coverage around the behavior-sensitive seams.**
   - UI: app-state watch/unwatch cleanup, optimistic write rollback, tool invocation for source/watchlist/status mutations, and no direct reducer drift for domain actions.
   - Extension: state read failure modes, source removal reclustering, mark all / status behavior, briefing persistence behavior if moved into the extension.
   - Runtime: stuck-run reconciliation and scheduled refresh behavior or explicit absence of a timer.
   - Keep tests focused; do not attempt screenshot-level coverage for the full visual design in this cleanup pass.

7. **Clean up dead imports and tighten tsconfig hygiene opportunistically.**
   - Remove `dailyDigest` and `watchlistNames` if they remain unused after the split.
   - Consider enabling `noUnusedLocals` once the UI is split; it will catch this class of drift cheaply.

## Benefits & Trade-offs
- Benefits: clears hard file-size violations, reduces review load, prevents silent state loss, makes UI/agent/CLI semantics converge, and turns the background runtime from a promise into either real behavior or no behavior.
- Trade-offs: splitting the UI creates short-term churn across component imports and CSS selectors. Tool-backed UI mutations may feel slightly more indirect than local reducers and need careful optimistic-state handling to keep the app responsive. Hardening state reads is intentionally noisier: users with malformed state will see repair errors instead of silently continuing with empty data.

## Dependencies & Risks
- The UI bridge workaround exists for a real external-plugin duplicate-React issue documented in `README.md:46-50`. Do not blindly replace it with hooks until the plugin is tested in the same dev-plugin mode that originally failed. If hooks still fail, isolate the workaround behind one local bridge module and type it as strictly as possible.
- Moving UI mutations through tools changes runtime ordering. Verify that app-state watcher updates arrive after tool writes and that the UI does not double-create records during optimistic updates.
- State I/O hardening is a behavioral change. It should preserve first-run defaults while preventing malformed/truncated files from being overwritten.
- Implementing scheduled refresh from the runtime may require a clear host capability for invoking app tools from background runtimes. If that does not exist or is not appropriate, keep refresh logic in a shared Pi-safe module and have runtime call that module directly with the same state I/O helpers.
- CSS splitting must preserve production MF behavior: `ui/SignalDeskApp.tsx` or every exposed entry still needs to import the stylesheet entrypoint so external remotes ship their own styles.

## Next Steps
1. Fix the two hard-cap violations first: split `SignalDeskApp.tsx` and `styles.css` without changing behavior.
2. Extract and harden extension state I/O; add malformed-state tests before touching more tool actions.
3. Map every UI mutation as either UI-selection state or domain state, then route domain state through `signal_desk` tool actions.
4. Decide the background-runtime contract: real scheduled refresh now, or remove the no-op timer/capability until later.
5. Replace `window.prompt` editing with controlled forms after the action path is canonical.
6. Re-run `pnpm test`, `pnpm typecheck`, `pnpm build` in the plugin package, then run monorepo `pnpm typecheck` before landing source changes.

Verification checklist:
- A malformed `.sero/apps/signal-desk/state.json` does not get replaced with defaults by `signal_desk add_source`, `refresh`, or any other write action.
- Removing a source from the UI and from `sero signal_desk remove_source` produces identical article/cluster/watchlist state.
- Marking clusters/articles from the UI and the agent produces identical statuses.
- Scheduled refresh either actually creates/upserts `RefreshRun` records on interval, or the plugin no longer advertises a background scheduler.
- Production build still loads `SignalDeskApp` from `dist/ui/remoteEntry.js` with styles and guide images intact.
