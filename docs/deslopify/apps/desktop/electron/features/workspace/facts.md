# Facts — apps/desktop/electron/features/workspace

_Last reviewed: 2026-04-12_

## What this code does
This module owns workspace lifecycle and metadata: registry/config I/O,
workspace creation/attachment, container toggle and mount metadata,
multi-root support, message-based workspace inference, and host-side file
watching for workspace roots.

## Shape & metrics
- Total files: 8
- Total LOC: 1,150
- Largest file: `apps/desktop/electron/features/workspace/manager.ts` (461 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC):
  - `apps/desktop/electron/features/workspace/manager.ts` (461)
- External dependencies of note:
  - `@electron/platform/env` (`SERO_HOME`, `SERO_AGENT_DIR`)
  - shared infra container/workspace managers from IPC callers
  - Node filesystem (`fs`, `path`) and host watchers (`fs.watch`)
- Upstream callers:
  - Imported from 27 files across Electron features, IPC, CLI, and tests
    (container config, VCS, subagent runtime, gateway ops, etc.)
- Downstream dependencies:
  - `electron/ipc/workspace/**`, `electron/ipc/editor/path-resolution.ts`,
    and container config/build paths that consume workspace roots/mounts.

## Architectural notes
- This module is a foundational owner for AD-010 workspace semantics and AD-018
  container mount composition.
- Multi-root behavior is intentionally delegated (`roots.ts`) and mount/reference
  behavior is delegated (`mounts.ts`) to keep `manager.ts` under the 500 LOC cap.
- Workspace container recreation is centralized in `container-sync.ts` and reused
  by IPC/CLI surfaces to avoid inconsistent mount-apply behavior.

## Surprising discoveries
- `manager.ts` is already at 461 LOC and still contains duplicated cleanup logic
  for editor-state deletion in both `remove()` and `close()` (`manager.ts:313`, `manager.ts:339`).
- Error swallowing exists in critical lifecycle paths (`manager.ts:313`, `manager.ts:339`)
  via `.catch(() => {})`, which can hide disk-permission failures.
- `watcher.ts` still uses `catch (err: any)` (`watcher.ts:126`) despite strict typing expectations.

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 8 (unchanged)
- Largest file: `apps/desktop/electron/features/workspace/manager.ts` (468 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC): `manager.ts` (468)

### What changed
- Added a private `cleanupEditorState()` helper so workspace remove/close paths share one cleanup flow.
- Workspace lifecycle cleanup now tolerates ENOENT but warns on real editor-state deletion failures
  instead of swallowing them silently.

### Still outstanding
- `manager.ts` is still near-cap and has not yet been split by responsibility.
- `watcher.ts` still needs its typed error-normalization cleanup.
