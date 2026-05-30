# Facts — apps/desktop/electron/features/apps

_Last reviewed: 2026-04-16_

## What this code does
This folder owns app/runtime glue in Electron main for Sero apps: app manifest discovery, shared JSON state file IO/watchers, session extension wiring (`createSeroExtensionFactory`), skill visibility overrides, and Git app state synchronization helpers used by IPC and agent runtime flows.

## Shape & metrics
- Total files: 8
- Total LOC: 1,690
- Largest file: `apps/desktop/electron/features/apps/discovery/index.ts` (312 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - Pi SDK extension APIs (`@earendil-works/pi-coding-agent`)
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
- The original Wave A watcher-race note had already partially drifted by execution time: `AppStateManager.watch()` now inserted a placeholder entry before async setup, but failed bootstrap paths still left broken entries behind and cancelled concurrent bootstrap remained under-tested.
- Type escape hatches were concentrated in small helper files (`extensions/git-checkpoints.ts`, `extensions/ui-context.ts`) rather than in large orchestration files, making the highest-risk cleanup comparatively focused.
- `extensions/skill-visibility.ts` had already been rebased onto `@sero-ai/common` before this execution pass, so the host/plugin coupling item is now effectively about `git-app/manager.ts` importing git-plugin internals.
- `isPlugin` in discovery is still derived from parsed/validated plugin metadata (`Boolean(plugin)`) rather than direct `sero.plugin` key presence, which can hide malformed plugin manifests from plugin-specific UI flows (`discovery/index.ts:140-182`).

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 10 (was 8 in the original 2026-04-12 snapshot; the live folder already included `app-control/host-service.ts` and `web-app/manager.ts` before this execution pass)
- Total LOC: 2,146 (was 1,690 in the original snapshot)
- Largest file: `apps/desktop/electron/features/apps/state/manager.ts` (324 LOC)
- Files over 500 LOC: none (was none)
- Type escape hatches remaining: 1 documented generic no-op seam in `extensions/ui-context.ts` (`undefined!` inside `unsupportedCustom()`); the original `any`/`as unknown as` High-item escape hatches are gone

### What changed
- Reworked `AppStateManager` bootstrap around an explicit per-entry setup promise so concurrent `watch()` calls coalesce, cancelled bootstrap never reaches `fs.watch()`, and failed startup attempts are dropped instead of leaving broken watcher-map entries behind.
- Tightened bootstrap file creation so non-`EEXIST` errors are no longer swallowed during watcher startup, which keeps retry semantics truthful.
- Replaced loose checkpoint-summary parsing in `extensions/git-checkpoints.ts` with record guards for assistant messages, bash input, and agent-end payloads; added focused checkpoint summary fallback coverage plus VCS checkpoint-source revalidation.
- Replaced the `theme: any` UI-context stub with a concrete Pi `Theme` instance and added focused extension UI coverage for notification bridging plus inert unsupported helpers.

### Still outstanding
- The remaining host/plugin coupling work is concentrated in `apps/desktop/electron/features/apps/git-app/manager.ts`; the skill-visibility half of the original Medium tracker is already neutralized upstream via `@sero-ai/common`.
- Discovery still needs stricter `sero.plugin` validation so malformed metadata does not silently declassify plugins.
- `createSeroExtensionFactory` is still a mixed-responsibility composition root and has not been split into focused registrars.
- `onFileChange()` still has no unsubscribe path for repeated test/dev registration scenarios.
