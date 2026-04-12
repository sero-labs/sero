# Facts — apps/desktop/electron/features/apps

_Last reviewed: 2026-04-12_

## What this code does
This folder owns app/runtime glue in Electron main for Sero apps: app manifest discovery, shared JSON state file IO/watchers, session extension wiring (`createSeroExtensionFactory`), skill visibility overrides, and Git app state synchronization helpers used by IPC and agent runtime flows.

## Shape & metrics
- Total files: 8
- Total LOC: 1,690
- Largest file: `apps/desktop/electron/features/apps/discovery/index.ts` (312 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - Pi SDK extension APIs (`@mariozechner/pi-coding-agent`)
  - Electron `BrowserWindow` fanout in app-state change broadcaster
  - Workspace/container/subagent managers from Electron feature layer
  - Plugin-package internals from `@plugins/sero-admin-plugin` and `@plugins/sero-git-plugin`
  - Node filesystem watchers (`fs.watch`, recursive workspace watch)
- Upstream callers:
  - 17 runtime files import this feature area (IPC agent/apps handlers, CLI bridge, kanban orchestration, subagent runtime)
  - Plus focused tests in `electron/__tests__/features/apps/**`
- Downstream dependencies:
  - `electron/ipc/apps/{apps,app-state,git-app}.ts`
  - `electron/ipc/agent/core/{agent,agent-prompt}.ts`
  - Kanban orchestration modules that depend on `appStateManager`

## Architectural notes
- This is a boundary-heavy module: it couples app discovery, extension runtime behavior, and cross-window state broadcasting in one area.
- `appStateManager` is effectively infrastructure, not app-specific utility; many non-app modules depend on it for state reactivity.
- Two files currently import plugin internals directly (`sero-admin-plugin` + `sero-git-plugin`), creating host↔plugin coupling that conflicts with clean app/plugin separation (AD-001 intent).
- `createSeroExtensionFactory` is the integration point for AD-020/AD-021-adjacent behavior (CLI prompt injection + subagent tool registration).

## Surprising discoveries
- `AppStateManager.watch()` initializes watchers asynchronously without reserving an entry first, so rapid watch/unwatch or concurrent watch calls can miscount refs and leave orphan watchers (`state/manager.ts:128-153`).
- Type escape hatches are concentrated in small helper files (`extensions/git-checkpoints.ts:19-20,26`, `extensions/ui-context.ts:51,63`) rather than in large orchestration files.
- `isPlugin` in discovery is derived from parsed/validated plugin metadata (`Boolean(plugin)`) rather than direct `sero.plugin` key presence, which can hide malformed plugin manifests from plugin-specific UI flows (`discovery/index.ts:140-182`).
