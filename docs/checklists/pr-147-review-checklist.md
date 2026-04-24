# PR #147 review checklist

Context: validated against `refactor/extract-kanban-plugin` for PR [#147](https://github.com/sero-labs/sero/pull/147).

## Merge blockers

- [x] **Add fault isolation to app runtime reconcile** (#1)
  - Wrap each per-target `disposeInstance()` / `startInstance()` call in `try/catch` inside `apps/desktop/electron/features/apps/runtime/manager.ts`
  - Log the app/workspace key and whether the failure happened during dispose or start
  - Make failed initial reconcile retryable so `initialize()` does not leave the manager effectively stuck after one startup failure
  - Add a regression test in `apps/desktop/electron/__tests__/features/apps/runtime/manager.test.ts`

- [x] **Serialize/coalesce concurrent app runtime reconciles** (#2)
  - Add manager-level reconcile serialization so overlapping calls from workspace and plugin lifecycle events cannot double-start the same runtime
  - Prefer a tail-chained queue/coalescing pattern in the manager instead of duplicating guards in each IPC caller
  - Add a deterministic concurrency test in `apps/desktop/electron/__tests__/features/apps/runtime/manager.test.ts`

## Important follow-up

- [x] **Cache transpiled runtime bundles and stop cache-busting unchanged loads** (#3)
  - Add an mtime/hash-based short-circuit in `apps/desktop/electron/features/apps/runtime/loader.ts`
  - Reuse a stable import path/URL when the transpiled output is unchanged
  - Add a loader test that locks in the caching behavior in `apps/desktop/electron/__tests__/features/apps/runtime/loader.test.ts`

- [x] **Validate `customTools` at the runtime host boundary** (#5)
  - Replace the unchecked `as ToolDefinition[]` cast in `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
  - Either narrow the shared contract to `ToolDefinition[]` or add lightweight runtime validation before passing values into the subagent path
  - Add a negative test for invalid tool definitions

## Follow-up / cleanup

- [x] **Design a better native dependency externalization strategy for TS runtimes** (#4)
  - Revisit `apps/desktop/electron/features/apps/runtime/loader.ts` so native modules are not blindly bundled except for `electron` and `node-pty`
  - Consider a manifest-driven externals list or a broader default externalization strategy
  - Treat this as scalability hardening, not a blocker for PR #147

- [ ] **Remove Kanban domain contracts from `@sero-ai/common`** (#7)
  - This is now a required pre-merge follow-up, not a closed documentation item
  - Follow `docs/tasks/pr-147-kanban-contract-extraction.md`
  - End state: the external Kanban plugin owns its own domain types/validation and `@sero-ai/common` keeps only generic platform contracts

- [x] **Document the settings watcher bootstrap ordering** (#9)
  - Add a brief comment explaining why the settings watcher is registered before the non-blocking `ensureInfra()` bootstrap completes
  - Point future readers at the fact that runtime settings reload paths call `ensureInfra()` lazily

- [x] **Warn when a global manifest cannot resolve `globalStatePath`** (#10)
  - Add a `console.warn` in `apps/desktop/electron/features/apps/runtime/manager.ts` when a global-scope manifest is skipped because no state file path is available
  - Keep the skip behavior, but make manifest bugs debuggable

- [x] **Remove the stale kanban example from the CLI prompt block** (#11)
  - Update `apps/desktop/electron/cli/index.ts` so the JSON-parameter examples only mention commands that are actually built in / always available
  - Update or extend `apps/desktop/electron/__tests__/cli/prompt-block.test.ts` if needed

## Validated; no action needed

- [x] **No fix needed for `WorktreeManager` lifetime concern** (#6)
  - `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` creates `const worktreeManager = new WorktreeManager()` at module scope, not per host invocation
  - `WorktreeManager` currently appears stateless

- [x] **No fix needed for published package availability** (#8)
  - Confirmed on npm: `@sero-ai/common@0.1.0` and `@sero-ai/app-runtime@0.1.2` are published
  - The export/install flow can use published packages at the versions referenced by this PR
