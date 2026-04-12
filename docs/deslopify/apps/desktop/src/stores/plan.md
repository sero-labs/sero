# Refactoring Plan — apps/desktop/src/stores

_Plan drafted: 2026-04-12_

## Executive Summary
`src/stores` is functionally solid and type-safe, but two orchestration hubs (`agent.ts`, `app.ts`) are near the 500-LOC ceiling and a few renderer↔main lifecycle edges can desync on IPC failure. The goal is to keep stores as reliable contract owners by hardening destructive action error handling, extracting repeated agent logic, and splitting near-cap orchestration code before it becomes another hard-rule file-size violation.

## Issues Found (prioritized)
- **High** — Optimistic destructive actions can leave renderer/main state out of sync on IPC failure — `apps/desktop/src/stores/agent.ts:135-151` removes the local agent entry even when `window.sero.agent.close()` throws, and `apps/desktop/src/stores/workspace.ts:84-92` removes a workspace locally before `window.sero.workspace.close()` succeeds (failure is only logged). This risks ghost sessions/workspaces that reappear after reload and violates the four-layer consistency expectation. Effort: **S**.

- **Medium** — Core orchestration stores are one feature away from the 500-LOC cap — `apps/desktop/src/stores/agent.ts:1-489` and `apps/desktop/src/stores/app.ts:1-460` each mix multiple responsibilities (state, IPC orchestration, hydration/startup utilities, listener wiring), increasing review risk and future refactor cost. Effort: **M**.

- **Medium** — `agent.ts` duplicates optimistic user-message creation and ID generation in three flows — `apps/desktop/src/stores/agent.ts:155-176`, `apps/desktop/src/stores/agent.ts:198-218`, and `apps/desktop/src/stores/agent.ts:338-356`. This duplication already drifted (prompt/steer/collab paths are subtly different) and makes future message-shape changes error-prone. Effort: **S**.

- **Medium** — Module-level pending memory context has no explicit cleanup on session teardown — `apps/desktop/src/stores/agent-utils.ts:108-169` adds per-session entries on `memory_context` and clears only on the next assistant `message_start`. Session close/error paths do not prune stale session keys, so long-lived apps can accumulate dead map entries. Effort: **S**.

- **Low** — Selector helpers return fresh arrays/objects each call, creating avoidable render churn in hot UI paths — e.g. `apps/desktop/src/stores/agent-selectors.ts:25-29` (`useStreamingSessionIds`) and `apps/desktop/src/stores/sessions.ts:230-253` (`useSessionsByWorkspace`). Effort: **S**.

## Proposed Refactoring
1. **Make destructive actions IPC-result aware before mutating local state.**
   - Update `closeSession`/`closeWorkspace` paths to either:
     - commit local removal only after successful IPC, or
     - keep optimistic updates but roll back on failure.
   - Add explicit error state updates so the UI can surface failures.
   - Aligns with Sero’s React→store→preload→main consistency rule.

2. **Split `agent.ts` into orchestration slices under `src/stores/agent/`.**
   - Keep `agent.ts` as a thin public surface; move prompt lifecycle, model actions, and collaboration hydration into focused modules.
   - Extract shared helper for optimistic user-message enqueue:
     - before: repeated `userMessageId` + message append in 3 methods
     - after: `appendOptimisticUserMessage(sessionId, text, attachments?)`.

3. **Split `app.ts` by ownership boundaries.**
   - Target shape:
     - `stores/app/state.ts` (store definition)
     - `stores/app/layout-hydration.ts` (`loadLayout`)
     - `stores/app/discovery.ts` (`discoverAndRegisterApps`, plugin-change reconciliation)
     - `stores/app/listeners.ts` (`listenForNewApps`)
   - Keep existing exports from `stores/app.ts` as compatibility re-exports.

4. **Add explicit teardown hooks for agent utility module-level maps.**
   - Introduce `clearAgentSessionBuffers(sessionId)` in `agent-utils.ts` and call it from session close/failure paths.
   - Also clear buffers on `agent_end` for unknown sessions to avoid stale entries.

5. **Stabilize high-traffic selectors.**
   - Memoize or derive streaming IDs within store state updates (or use `useShallow` selectors returning stable references).
   - Move expensive grouping/filtering (`useSessionsByWorkspace`) to memoized component-level selectors when query/session inputs change.

## Benefits & Trade-offs
- Benefits: stronger renderer/main consistency, fewer ghost-state bugs, easier-to-review store modules, and lower risk of crossing the 500-LOC cap during feature work.
- Trade-offs: moderate import churn from store-file splits and slightly more indirection when tracing control flow.

## Dependencies & Risks
- Store split work touches many consumers in `components/layout/**`, `hooks/**`, and app-control bridge code.
- Error-handling behavior changes can expose latent UI assumptions (some flows currently assume close/remove always succeeds).
- Any exported API reshaping should preserve public signatures to keep Wave B fixes incremental.

## Next Steps
1. Land High fix: make `closeSession` and `closeWorkspace` consistent on IPC failure.
2. Extract optimistic user-message helper and de-duplicate prompt/steer/collab paths.
3. Add session-buffer teardown for `pendingMemoryContext` in `agent-utils`.
4. Split `agent.ts` and `app.ts` into submodules before either file crosses 500 LOC.
5. After fixes, re-run deslopify on `components/layout` (Wave C) with updated store ownership boundaries.
