# Facts — plugins/sero-git-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-git-plugin/` is a built-in Sero developer-tools plugin that exposes Git repository state to both the agent and the desktop UI. The extension registers the `git_manager` tool/`/git` command, the Electron host imports the same service logic through the dedicated `gitApp` IPC bridge, and the federated React UI renders branches, commit history, diffs, staging, stashes, and worktree actions from `.sero/apps/git/state.json` inside each workspace.

## Shape & metrics
- Total tracked files: 35
- Total tracked LOC: 4,672
- Largest files:
  - `plugins/sero-git-plugin/extension/git-commands.ts` (457 LOC)
  - `plugins/sero-git-plugin/extension/git-service.ts` (457 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC):
  - `plugins/sero-git-plugin/extension/git-commands.ts` (457 LOC)
  - `plugins/sero-git-plugin/extension/git-service.ts` (457 LOC)
  - `plugins/sero-git-plugin/ui/components/BranchPanel.tsx` (421 LOC)
- External dependencies of note:
  - Pi extension/runtime APIs (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`)
  - Git CLI via `execFileSync` / `execFile`
  - `@sero-ai/app-runtime` for file-backed plugin state and the `window.sero` bridge
  - Module Federation + Vite for the remote UI (`vite.config.ts` uses production `base: './'` correctly)
- Upstream callers / consumers of note:
  - `apps/desktop/electron/features/apps/git-app/manager.ts` imports the plugin extension’s `refreshGitState()` / `runGitAction()` directly
  - `apps/desktop/electron/ipc/apps/git-app.ts` and `apps/desktop/electron/preload/apps/app-domain.ts` expose the host-side `gitApp.run()` bridge
  - `packages/app-runtime/src/sero-bridge.ts` and `apps/desktop/src/types/electron-apps.d.ts` mirror the bridge contract for remotes
  - `apps/desktop/src/components/layout/titlebar/GitShipPanel.tsx` also invokes `window.sero.gitApp.run(...)`
- Downstream dependencies:
  - Workspace Git state at `.sero/apps/git/state.json`
  - `.git/info/exclude` mutation to hide the plugin’s state directory from Git status
  - Worktree metadata, stash state, default-branch detection, and direct repo mutations (`switch`, `branch -d/-D`, `worktree remove`, `stash`, `cherry-pick`, `push`)
- Test surface:
  - 8 Vitest files / 26 passing tests (`pnpm --filter @sero-ai/plugin-git test` on 2026-04-13)
  - Coverage is strong for extension parsing/service helpers and `ui/lib/**`, but there is no direct component/UI interaction coverage

## Architectural notes
- The package gets the important plugin-platform basics right: `pi.registerTool()` is used normally (aligns with AD-020), the manifest declares a standard Sero app/plugin, and the remote build uses relative production asset paths.
- This plugin is unusually host-integrated for a built-in plugin: the Electron host imports `@plugins/sero-git-plugin/extension/git-service` directly instead of invoking the tool path, so contract truthfulness across React → app-runtime → preload → IPC → host → plugin service matters more than in looser plugins.
- `shared/types.ts` is the plugin-local source of truth for `GitManagerRequest`, including `worktreePath` and `force`, but the surrounding host bridge types are duplicated outside the plugin and have already drifted.
- The plugin is also a Pi package. That means extension behavior must remain truthful even without the desktop watcher/poller path that Sero provides.

## Runtime-sensitive surfaces
- The direct Git action bridge (`GitApp.tsx` → `window.sero.gitApp.run()` → preload/IPC → `gitWorkspaceStateManager.runWorkspaceAction()` → `runGitAction()`) is a four-layer cross-process contract; request/result shape drift here will compile green in one layer and fail elsewhere.
- `readState()` is used on mutation-adjacent paths (`diff`, `show_commit`, cached query actions). If malformed JSON is treated as first run, the next write can silently replace a real snapshot with defaults.
- Read paths such as `branches` and `log` currently depend on the persisted snapshot instead of the repo as the source of truth, which is especially risky in Pi CLI or any path without an active desktop watcher.
- `ensureGitStateIgnored()` mutates `.git/info/exclude`; cleanup must preserve the “hide `.sero/apps/git/` anywhere in the repo tree” behavior.
- Worktree removal, cherry-pick auto-stash, and upstream push fallback are behavior-sensitive success paths; refactors here need targeted smoke tests.

## Surprising discoveries
- The canonical Git action request shape lives in `plugins/sero-git-plugin/shared/types.ts:119-129`, but the surrounding bridge types in `packages/app-runtime/src/sero-bridge.ts:28-45` and `apps/desktop/src/types/electron-apps.d.ts:91-100` omit `worktreePath` and `force`; meanwhile the UI really does send those fields from `ui/components/BranchPanel.tsx:91-99`.
- The preload bridge erases typing entirely (`apps/desktop/electron/preload/apps/app-domain.ts:95-97` returns `Promise<unknown>`), and the remote UI casts the result back locally in `ui/GitApp.tsx:34-37,85-86`.
- `runGitAction('log')` and `runGitAction('branches')` do not inspect Git directly; they only read `.sero/apps/git/state.json` (`extension/git-service.ts:216-237`). In the desktop path that may be fresh because of watchers, but in Pi CLI that is only as current as the last refresh.
- `readState()` treats every failure the same (`extension/state-io.ts:17-23`), so a malformed state file is indistinguishable from “missing file on first run.”
- The plugin already has a few small duplication seams: branch colors exist in both `shared/types.ts:214-228` and `ui/lib/graph-layout.ts:31-35`, and relative-date formatting is implemented separately in `ui/components/BranchPanel.tsx:410-420` and `ui/components/CommitGraph.tsx:269-287`.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total tracked files: 43 (was 35)
- Largest source file: `plugins/sero-git-plugin/extension/git-service.ts` (457 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged in the bridge/UI ownership seams; D1 only touched snapshot integrity

### What changed
- `extension/state-io.ts` now distinguishes missing snapshots from malformed/unreadable snapshots and fails loud on corruption.
- Added direct state-I/O coverage so malformed `.sero/apps/git/state.json` no longer looks like first run in tests.
- The existing Git service/action test suite still passes after the state-integrity change.

### Still outstanding
- The remaining High item is still the cross-layer Git action contract drift.
- Medium live-query semantics for `log`/`branches`, file splitting, and UI coverage remain pending.
