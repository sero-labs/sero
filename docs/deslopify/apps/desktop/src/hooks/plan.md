# Refactoring Plan — apps/desktop/src/hooks

_Plan drafted: 2026-04-12_

## Executive Summary
`src/hooks` is generally healthy and compact, but a few orchestration hooks are carrying too much coordination logic and hidden lifecycle risk. The priority is to make `useSessionAgent` and `useWorkspaceFiles` more predictable under load (fewer implicit retries/churn, clearer dependency ownership) while preserving current UX behavior.

## Issues Found (prioritized)
- **Medium** — ~~`useSessionAgent` combines multiple orchestration responsibilities with suppressed dependency checks — `apps/desktop/src/hooks/useSessionAgent.ts:39-74` and `apps/desktop/src/hooks/useSessionAgent.ts:87-116` handle session open/focus, collaboration hydration, and container ensure with `eslint-disable` comments for exhaustive deps (`useSessionAgent.ts:74`, `useSessionAgent.ts:116`). This increases stale-closure risk and makes lifecycle regressions hard to test.~~ ✅ 2026-04-12 (`useSessionAgent` is now a thin wrapper over focused `session-agent/*` hooks with no exhaustive-deps suppression). Effort: **M**.

- **Medium** — ~~Session refresh trigger can spam IPC on bursty agent completions — `apps/desktop/src/hooks/useSessionAgent.ts:119-138` calls `loadSessions()` whenever any tracked agent transitions streaming→idle, with no debounce/coalescing. Multi-agent/subagent bursts can trigger repeated `sessions.list` calls.~~ ✅ 2026-04-12 (idle refresh now flows through `useDebouncedCallback(..., 200)`). Effort: **S**.

- **Medium** — ~~Workspace file cache is global and unbounded by workspace count — `apps/desktop/src/hooks/useWorkspaceFiles.ts:34-35` stores arrays of up to 5,000 paths per workspace (`useWorkspaceFiles.ts:23`), and entries only expire by TTL checks during future reads. There is no max-size eviction, so long sessions across many workspaces can retain stale arrays in memory.~~ ✅ 2026-04-12 (cache now uses TTL + max-entry eviction and clears stale entries on load failure). Effort: **S**.

- **Low** — ~~Built-in command behavior (`/login`, `/logout`) is duplicated across two paths — `apps/desktop/src/hooks/useChatPromptInput.ts:63-76` and `apps/desktop/src/hooks/useChatPromptInput.ts:136-147`. Minor drift risk if command handling changes.~~ ✅ 2026-04-15 (`dd7399b3`) — `useChatPromptInput.ts` now routes slash-menu selection and raw submit handling through one shared built-in command helper, with focused regression coverage. Effort: **S**.

- **Low** — ~~Copy-status timer logic is duplicated in GitHub auth flow — `apps/desktop/src/hooks/useGitHubAuthFlow.ts:94-108` repeats timer-reset boilerplate for success/failure states.~~ ✅ 2026-04-15 (`dd7399b3`) — `useGitHubAuthFlow.ts` now uses one transient copy-state helper for success/failure feedback timing, with focused regression coverage. Effort: **S**.

## Proposed Refactoring
1. ~~**Decompose `useSessionAgent` into focused orchestration hooks.**~~ ✅ 2026-04-12 (Wave E2 working tree)
   - Split into:
     - `useActiveSessionSync` (open/focus + collaboration hydrate)
     - `useContainerEnsureOnSessionFocus` (AD-018 container startup)
     - `useSessionListRefreshOnAgentIdle` (refresh policy)
   - Kept `useSessionAgent` as a thin composition wrapper.

2. ~~**Coalesce session-list refreshes with the shared debounce utility.**~~ ✅ 2026-04-12 (Wave E2 working tree)
   - Replaced the direct `loadSessions()` trigger in the idle-detection effect with `useDebouncedCallback(loadSessions, 200)`.
   - Preserved “eventual refresh after turn completion” behavior while reducing IPC chatter.

3. ~~**Add bounded eviction for workspace file cache.**~~ ✅ 2026-04-12 (Wave E2 working tree)
   - Kept TTL behavior while introducing max cache entries with LRU-style eviction metadata.
   - Cleared stale cache entries on explicit refresh failure to avoid stale false confidence.

4. ~~**Deduplicate built-in command handling in prompt hook.**~~ ✅ 2026-04-15 (`dd7399b3`)
   - Extracted shared built-in command routing in `useChatPromptInput.ts`.
   - Reused it from both slash-menu selection and raw submit handling.

5. ~~**Extract timer-reset helper in GitHub auth flow.**~~ ✅ 2026-04-15 (`dd7399b3`)
   - Introduced local `setTransientCopyState()` + timer cleanup helpers so success/failure copy feedback now uses one path.

## Benefits & Trade-offs
- Benefits: clearer hook ownership, fewer hidden lifecycle pitfalls, less IPC churn under heavy streaming activity, and lower maintenance overhead for command/auth UX behavior.
- Trade-offs: additional hook modules and slightly more indirection when tracing ChatPanel/session orchestration behavior.

## Dependencies & Risks
- `useSessionAgent` split touches startup and ChatPanel wiring; behavior parity tests are needed to avoid focus/container regressions.
- Debounce timings for session refresh should be tuned to avoid making session rename/firstMessage updates feel delayed.
- Cache eviction policy must not break path completion immediately after switching workspaces.

## Next Steps
1. ~~Extract `useSessionAgent` into three focused hooks with unchanged public behavior.~~ ✅ 2026-04-12
2. ~~Debounce session-list refresh after stream completion.~~ ✅ 2026-04-12
3. ~~Add capped LRU eviction to `useWorkspaceFiles` cache.~~ ✅ 2026-04-12
4. ~~Deduplicate built-in command/timer helper code paths.~~ ✅ 2026-04-15 (`dd7399b3`)
5. ~~Re-check `ChatPanel` and explorer prompt UX after these hook changes.~~ ✅ 2026-04-15 (`dd7399b3`) — covered by focused hook tests for prompt command routing and GitHub copy-state feedback, plus the full desktop Vitest run.

## Execution log
- 2026-04-12 — Medium Wave E2 (working tree): split `useSessionAgent` into focused `session-agent/*` hooks, debounced idle-triggered session refreshes, and added bounded workspace-file cache eviction.
- 2026-04-15 — `dd7399b3` — `refactor(hooks): dedupe prompt and github auth helpers`
