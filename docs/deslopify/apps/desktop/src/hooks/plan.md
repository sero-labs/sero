# Refactoring Plan — apps/desktop/src/hooks

_Plan drafted: 2026-04-12_

## Executive Summary
`src/hooks` is generally healthy and compact, but a few orchestration hooks are carrying too much coordination logic and hidden lifecycle risk. The priority is to make `useSessionAgent` and `useWorkspaceFiles` more predictable under load (fewer implicit retries/churn, clearer dependency ownership) while preserving current UX behavior.

## Issues Found (prioritized)
- **Medium** — `useSessionAgent` combines multiple orchestration responsibilities with suppressed dependency checks — `apps/desktop/src/hooks/useSessionAgent.ts:39-74` and `apps/desktop/src/hooks/useSessionAgent.ts:87-116` handle session open/focus, collaboration hydration, and container ensure with `eslint-disable` comments for exhaustive deps (`useSessionAgent.ts:74`, `useSessionAgent.ts:116`). This increases stale-closure risk and makes lifecycle regressions hard to test. Effort: **M**.

- **Medium** — Session refresh trigger can spam IPC on bursty agent completions — `apps/desktop/src/hooks/useSessionAgent.ts:119-138` calls `loadSessions()` whenever any tracked agent transitions streaming→idle, with no debounce/coalescing. Multi-agent/subagent bursts can trigger repeated `sessions.list` calls. Effort: **S**.

- **Medium** — Workspace file cache is global and unbounded by workspace count — `apps/desktop/src/hooks/useWorkspaceFiles.ts:34-35` stores arrays of up to 5,000 paths per workspace (`useWorkspaceFiles.ts:23`), and entries only expire by TTL checks during future reads. There is no max-size eviction, so long sessions across many workspaces can retain stale arrays in memory. Effort: **S**.

- **Low** — Built-in command behavior (`/login`, `/logout`) is duplicated across two paths — `apps/desktop/src/hooks/useChatPromptInput.ts:63-76` and `apps/desktop/src/hooks/useChatPromptInput.ts:136-147`. Minor drift risk if command handling changes. Effort: **S**.

- **Low** — Copy-status timer logic is duplicated in GitHub auth flow — `apps/desktop/src/hooks/useGitHubAuthFlow.ts:94-108` repeats timer-reset boilerplate for success/failure states. Effort: **S**.

## Proposed Refactoring
1. **Decompose `useSessionAgent` into focused orchestration hooks.**
   - Split into:
     - `useActiveSessionSync` (open/focus + collaboration hydrate)
     - `useContainerEnsureOnSessionFocus` (AD-018 container startup)
     - `useSessionListRefreshOnAgentIdle` (refresh policy)
   - Keep `useSessionAgent` as a thin composition wrapper.

2. **Coalesce session-list refreshes with the shared debounce utility.**
   - Replace direct `loadSessions()` trigger in idle-detection effect with `useDebouncedCallback(loadSessions, 150-300)`.
   - Preserve “eventual refresh after turn completion” behavior while reducing IPC chatter.

3. **Add bounded eviction for workspace file cache.**
   - Keep TTL behavior, but introduce max cache entries (e.g. 8–12 workspaces) using simple LRU metadata.
   - Optional: clear cache entry on explicit `refresh()` failure to avoid stale false confidence.

4. **Deduplicate built-in command handling in prompt hook.**
   - Extract helper `handleBuiltinCommand(text)` returning boolean/side-effect.
   - Use from both slash-menu selection and raw submit path.

5. **Extract timer-reset helper in GitHub auth flow.**
   - Introduce small local helper (`setTransientCopyState`) to collapse repeated timeout cleanup and state toggles.

## Benefits & Trade-offs
- Benefits: clearer hook ownership, fewer hidden lifecycle pitfalls, less IPC churn under heavy streaming activity, and lower maintenance overhead for command/auth UX behavior.
- Trade-offs: additional hook modules and slightly more indirection when tracing ChatPanel/session orchestration behavior.

## Dependencies & Risks
- `useSessionAgent` split touches startup and ChatPanel wiring; behavior parity tests are needed to avoid focus/container regressions.
- Debounce timings for session refresh should be tuned to avoid making session rename/firstMessage updates feel delayed.
- Cache eviction policy must not break path completion immediately after switching workspaces.

## Next Steps
1. Extract `useSessionAgent` into three focused hooks with unchanged public behavior.
2. Debounce session-list refresh after stream completion.
3. Add capped LRU eviction to `useWorkspaceFiles` cache.
4. Deduplicate built-in command/timer helper code paths.
5. Re-check `ChatPanel` and explorer prompt UX after these hook changes.
