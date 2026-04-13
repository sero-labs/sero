# Refactoring Plan — apps/desktop/src/components/apps

_Plan drafted: 2026-04-13_

## Executive Summary
The last unreviewed `components/apps` surfaces are in decent shape overall: `ActiveAppPanel.tsx` is intentionally thin, the dashboard files are small, and adjacent `ErrorBoundary.tsx` is healthy enough to leave alone. The real debt is concentrated in the shared mount seam. `SeroAppMount.tsx` and `dashboard/WidgetMount.tsx` duplicate the same session-bootstrap and `AppProvider` wiring, but that duplication has already drifted: widgets do not honor workspace hydration the same way full apps do, and both helpers still assume `openSession()` throws even though the agent store currently absorbs failures. This is worth a small focused cleanup and test pass, not another broad app-surface rewrite.

## Issues Found (prioritized)
- **Medium** — ~~Full-app and widget mounts duplicate session bootstrap and app-runtime context wiring, and the duplicated helper is already mismatched with the real agent-store failure contract~~ ✅ 2026-04-13 (`456e1619`) — landed `apps/desktop/src/components/apps/useAppRuntimeMount.ts`, reduced both mount surfaces to thin presenters, and added an explicit post-`openSession()` readiness check before revealing chat or dispatching prompts.

- **Medium** — ~~Dashboard widget startup and fallback behavior has already drifted from full-app behavior~~ ✅ 2026-04-13 (`456e1619`) — `WidgetMount.tsx` now uses the same workspace-hydration gate as `SeroAppMount.tsx`, so widgets show a loading state during cold-start hydration instead of a false missing-workspace placeholder.

- **Medium** — ~~Regression coverage is too thin around the exact seams this cleanup would touch~~ ✅ 2026-04-13 (`456e1619`) — added dedicated `apps/desktop/src/components/apps/dashboard/Dashboard.test.tsx` and `apps/desktop/src/components/apps/dashboard/WidgetMount.test.tsx` coverage for the dashboard/widget seam.

## Proposed Refactoring
1. **Extract one shared app-runtime mount helper for session bootstrap and context assembly.**
   - Introduce a focused helper or hook under this area (for example `src/components/apps/lib/app-runtime-mount.ts` or `src/components/apps/hooks/useAppRuntimeMount.ts`) that owns:
     - selecting or creating the target session for the active workspace
     - opening/focusing that session in the agent store
     - revealing the global chat panel
     - returning a `promptAgent()` callback with an explicit success/failure contract
     - building the common `AppContextValue`
   - `SeroAppMount` and `WidgetMount` should become thin presenters over that shared runtime helper.
   - Keep the public behavior identical where possible, but stop duplicating the same renderer/store choreography in two files.
   - This aligns with AD-001 and AD-003: the shell owns app selection and global chat, while mount surfaces should stay thin over shared orchestration.

2. **Unify workspace-scoped loading semantics between full apps and widgets.**
   - Standardize one mount-state policy keyed on `manifest.scope`, `workspacesReady`, `activeWorkspaceId`, and resolved `workspacePath`.
   - Dashboard widgets should show a loading state while workspace hydration is incomplete, then only show `No workspace selected` once the store is actually ready and there is still no workspace context.
   - Keep runtime-widget and federated-widget “unavailable” fallbacks, but make startup-state handling match the full-app path.
   - This is a behavior-sensitive step because it changes what the dashboard shows during cold start.

3. **Make the failure contract explicit instead of relying on swallowed `openSession()` errors.**
   - Prefer one of these two shapes:
     - have the shared mount helper verify post-`openSession()` readiness before dispatching the prompt, or
     - tighten `useAgentStore.openSession()` to return an explicit success/failure result that callers can honor
   - Do **not** leave the current shape where mount code pretends `openSession()` throws while the store absorbs errors and the prompt path silently no-ops.
   - If the store contract changes, audit `WorkspaceTree` and any other `openSession()` callers to keep semantics consistent.

4. **Add focused tests for dashboard mount behavior before or alongside the cleanup.**
   - Add `Dashboard.tsx` coverage for:
     - empty state when no widgets exist
     - mounted grid when widgets exist and width is available
     - persistence triggered on interaction stop rather than every layout frame
   - Add `WidgetMount.tsx` coverage for:
     - workspace-scoped widget while workspaces are still hydrating
     - workspace-scoped widget after hydration with no active workspace
     - runtime widget fallback when `runtimeComponent` is unavailable
     - federated widget fallback when no UI module is registered
   - If the shared bootstrap helper is extracted, give it a small unit/integration test around “session created/opened/chat revealed/prompt sent.”

5. **Leave `ActiveAppPanel` and `ErrorBoundary` as explicit no-follow-up surfaces for this wave.**
   - `ActiveAppPanel.tsx` is a 47-LOC switchboard over `dashboard`, `explorer`, and federated apps; there is no value in re-partitioning it.
   - `ErrorBoundary.tsx` already has the right keyed-recovery test shape and is not carrying architectural drift. Keep it out of the refactor unless shared mount work incidentally changes its usage.

## Benefits & Trade-offs
- Benefits: one authoritative mount/runtime contract for apps and widgets, fewer drift points between dashboard and full-app behavior, clearer failure semantics when session bootstrap breaks, and better regression coverage for a subtle renderer seam.
- Trade-offs: some churn across app/widget mount files, new test harness work for dashboard/grid behavior, and potential follow-on touches if `useAgentStore.openSession()` gets a more explicit return contract.

## Dependencies & Risks
- The shared-helper extraction touches runtime behavior, not just file shape: session focus timing, chat-panel visibility, and prompt dispatch ordering must remain correct.
- Tightening the `openSession()` contract is cross-module work if done at the store layer. `WorkspaceTree` and any other open-session callers must keep their current UX semantics.
- Unifying widget hydration behavior changes startup rendering on the dashboard. Verify that the new loading state does not mask real “no workspace selected” cases after hydration completes.
- Runtime widgets rely on the sticky `@sero-ai/app-runtime` registry; do not accidentally make dashboard widgets depend on the full app still being mounted.

## Next Steps
1. No remaining code work from this 2026-04-13 plan.
2. Keep `ActiveAppPanel.tsx` and `ErrorBoundary.tsx` unchanged unless a future review uncovers a new issue.
3. If the `components/apps` area grows again, re-open review from this shared-helper baseline rather than reintroducing duplicate mount wiring.
4. Verification checklist completed in this pass:
   - Cold-start dashboard/widget hydration states covered in `WidgetMount.test.tsx`.
   - Dashboard grid rendering + persist-on-interaction-stop covered in `Dashboard.test.tsx`.
   - Existing `ActiveAppPanel`, `SeroAppMount`, runtime-widget, dashboard-store, and `ErrorBoundary` tests re-run.
   - Monorepo `pnpm typecheck` passes.

## Execution log
- 2026-04-13 — `456e1619` — `refactor(desktop): unify app and widget mount runtime`
