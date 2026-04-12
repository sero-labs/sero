# Refactoring Plan — apps/desktop/electron/features/workspace

_Plan drafted: 2026-04-12_

## Executive Summary
Workspace ownership is mostly clean and intentionally modularized, but the core manager
is nearing the size cap and contains a few reliability drifts (silent error swallowing,
minor duplication, and lingering `any` in watcher error handling). The goal is to keep this
foundational AD-010/AD-018 module stable by trimming lifecycle duplication and tightening
error/type handling before the next feature wave lands.

## Issues Found (prioritized)
- **Medium** — `WorkspaceManager` is near cap and accumulating mixed responsibilities —
  `apps/desktop/electron/features/workspace/manager.ts:1-461` combines registry I/O,
  default workspace setup, CRUD, state toggles, mount/reference/root delegations,
  and inference plumbing. It is one medium feature away from crossing 500 LOC.
  Effort: **M**.

- **Medium** — ~~Lifecycle cleanup errors are silently swallowed in workspace remove/close paths —
  `apps/desktop/electron/features/workspace/manager.ts:313` and
  `apps/desktop/electron/features/workspace/manager.ts:339` suppress editor-state
  deletion failures with `.catch(() => {})`, hiding disk/permission regressions.~~ ✅ 2026-04-12 (`cleanupEditorState()` now centralizes cleanup with ENOENT-only tolerance and warning logs for real failures.)
  Effort: **S**.

- **Low** — ~~Duplicate editor-state cleanup logic appears in both `remove()` and `close()` —
  `apps/desktop/electron/features/workspace/manager.ts:310-313` and
  `apps/desktop/electron/features/workspace/manager.ts:336-339` repeat the same deletion block.~~ ✅ 2026-04-12 (`cleanupEditorState()` now owns the shared deletion path.)
  Effort: **S**.

- **Low** — File watcher error path still uses `any` typing —
  `apps/desktop/electron/features/workspace/watcher.ts:126` uses `catch (err: any)`.
  Effort: **S**.

## Proposed Refactoring
1. **Pre-emptively split `manager.ts` before cap breach.**
   - Extract registry/default-workspace lifecycle into a dedicated service module
     (e.g. `workspace-registry.ts`) and keep `manager.ts` focused on orchestration.

2. **Centralize editor-state cleanup in one helper.**
   - Add a private `cleanupEditorState(id)` helper in `manager.ts` (or shared util)
     and call it from both `remove()` and `close()`.
   - Keep behavior identical but remove duplicate branches.

3. **Stop swallowing cleanup failures silently.**
   - Replace `.catch(() => {})` with explicit ENOENT-only tolerance and warning logs
     for other failure modes.

4. **Tighten watcher error typing.**
   - Switch `catch (err: any)` to `unknown` with a safe error-message helper.

## Benefits & Trade-offs
- Benefits: keeps core workspace ownership maintainable, reduces hidden failure modes,
  and prevents file-size debt from spiking later in Wave A/B changes.
- Trade-offs: small structural churn in a widely imported module; requires careful
  touch discipline because many features depend on workspace manager behavior.

## Dependencies & Risks
- Changes here can affect container mount rebuild behavior (AD-018) and workspace
  resolution in agent/gateway/subagent flows.
- Refactors should avoid altering external method signatures consumed by 27 callers
  unless migration updates are staged together.

## Next Steps
1. Extract `manager.ts` lifecycle submodule(s) to keep the file comfortably below 500 LOC.
2. ~~Refactor remove/close cleanup into one shared helper with explicit error handling.~~ ✅ 2026-04-12
3. Replace watcher `any` catch with typed error normalization.
4. Continue Wave A: `deslopify apps/desktop/electron/features/agent`.

## Execution log
- 2026-04-12 — Medium Wave E4 (working tree): centralized editor-state cleanup in `cleanupEditorState()` and stopped swallowing non-ENOENT cleanup failures in workspace remove/close paths.
