# Facts — apps/desktop/src/components/apps

_Last reviewed: 2026-04-13_

## What this code does
`src/components/apps` is the renderer-side app surface for the desktop shell. At the top level it selects the active app (`ActiveAppPanel`) and mounts federated full-app UIs (`SeroAppMount`). Under `dashboard/` it renders the default landing page, resolves static + runtime widgets, and mounts widget-sized app surfaces with the same `@sero-ai/app-runtime` context. The heavier `explorer/` subtree remains separately documented in `docs/deslopify/apps/desktop/src/components/apps/explorer/`.

## Shape & metrics
- Total files: 51 TS/TSX files (`explorer/` included)
- Total LOC: 7,248
- Current review slice: 11 files / 1,045 LOC in the previously unreviewed root + `dashboard/` surfaces, plus adjacent `apps/desktop/src/components/ErrorBoundary.tsx` (124 LOC) sanity-checked here
- Largest file overall: `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` (480 LOC)
- Largest file in this review slice: `apps/desktop/src/components/apps/SeroAppMount.tsx` (170 LOC)
- Files over 500 LOC: none
- External dependencies of note: `@sero-ai/app-runtime`, `react-grid-layout`, module federation runtime via `src/lib/federation-registry.ts`, Zustand stores `app/dashboard/workspace/sessions/agent/theme`
- Upstream callers:
  - `apps/desktop/src/App.tsx` mounts `ActiveAppPanel` inside the shell `ErrorBoundary`
  - `apps/desktop/src/main.tsx` mounts the root `ErrorBoundary`
  - `apps/desktop/src/stores/app.ts` drives pending-app preload/activation semantics that `ActiveAppPanel` visualizes
- Downstream dependencies:
  - `packages/app-runtime/src/{context,use-agent-prompt,widget-registry,use-widget-registration}.ts`
  - `apps/desktop/src/stores/{app,dashboard,workspace,sessions,agent,theme}.ts`
  - `apps/desktop/src/lib/{federation-registry,open-app,persist-layout}.ts`

## Architectural notes
- `ActiveAppPanel` is intentionally a thin shell router and is currently healthy. Per AD-001 and AD-003, it should stay a selector/composer rather than becoming another orchestration surface.
- `SeroAppMount` and `dashboard/WidgetMount` are the real ownership seam in this folder. They translate shell/store state into `AppProvider` context and the app-runtime prompt bridge, so drift here changes both full-app and dashboard-widget behavior.
- `App.tsx` intentionally does not block shell render on workspace hydration, which means mount surfaces must distinguish “workspaces still loading” from “no workspace selected.”
- Dashboard runtime widgets rely on the sticky global widget registry in `@sero-ai/app-runtime`, so widget rendering can outlive the full app view during one renderer session.
- Adjacent `ErrorBoundary.tsx` is shell-critical but small, already covered by a focused keyed-recovery test, and does not warrant a standalone follow-up plan right now.

## Runtime-sensitive surfaces
- `ensureSessionAndPrompt()` in `SeroAppMount` and `WidgetMount` crosses `sessions`, `agent`, and `app` stores before a prompt is visible in the global chat panel.
- `AppProvider` context values (`workspaceId`, `workspacePath`, `stateFilePath`, `themeMode`, `themePresetId`) must stay aligned between full apps and widgets or `@sero-ai/app-runtime` hooks will behave differently depending on mount surface.
- Dashboard startup while `workspacesReady === false` is a real cold-start path because the shell renders before workspace hydration completes.
- Remote app/widget fallback behavior depends on `src/lib/federation-registry.ts` cache/retry semantics and the runtime widget registry snapshot.
- Error-boundary recovery depends on keyed remounting of the active-app region in `App.tsx` and should stay recoverable for plugin/app crashes.

## Surprising discoveries
- `SeroAppMount` and `dashboard/WidgetMount` duplicate nearly the same session-bootstrap helper and near-identical `AppProvider` context assembly.
- `WidgetMount` does not honor the `workspacesReady` loading gate that `SeroAppMount` uses, so the dashboard can report `No workspace selected` during ordinary startup hydration.
- There are no dedicated `Dashboard.tsx` or `WidgetMount.tsx` component tests; current coverage is store/registry-level plus one `SeroAppMount` loading-state check.
- `ActiveAppPanel.tsx` and `ErrorBoundary.tsx` are not where the debt sits; the risk is concentrated in the full-app/widget mount seam.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 54 (was 51)
- Largest file: `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` (480 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 1 test-only `as unknown as` cast in `apps/desktop/src/components/apps/explorer/useWorkspaceFileWatch.test.tsx` (outside this pass)
- Current non-explorer review slice: 14 files / 1,423 LOC (was 11 files / 1,045 LOC); largest file is now `apps/desktop/src/components/apps/dashboard/Dashboard.test.tsx` (246 LOC)

### What changed
- Added `apps/desktop/src/components/apps/useAppRuntimeMount.ts` as the shared app/widget runtime helper for session selection/create, session-open readiness checks, chat-panel reveal, and `AppContextValue` assembly.
- Reduced `SeroAppMount.tsx` and `dashboard/WidgetMount.tsx` to thin presenters over the shared helper, removing the duplicated session-bootstrap logic documented in the original review.
- Standardized workspace-scoped loading semantics so dashboard widgets now honor the same hydration gate as full apps.
- Added dedicated `Dashboard.test.tsx` and `WidgetMount.test.tsx` coverage for the previously untested dashboard/widget seam.

### Still outstanding
- No remaining items from the 2026-04-13 `components/apps` plan.
- Explorer-specific follow-ups remain tracked separately in `docs/deslopify/apps/desktop/src/components/apps/explorer/plan.md`.
