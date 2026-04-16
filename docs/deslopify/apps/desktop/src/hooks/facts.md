# Facts — apps/desktop/src/hooks

_Last reviewed: 2026-04-15_

## What this code does
`src/hooks` contains renderer orchestration hooks that glue shell UI to store and IPC behavior: prompt-input command/file completion, session↔agent lifecycle sync, checkpoint restore flow, keyboard shortcuts, GitHub auth device flow, user-feedback listener bootstrapping, debouncing utilities, and workspace file indexing.

## Shape & metrics
- Total files: 9
- Total LOC: 939
- Largest file: `apps/desktop/src/hooks/useChatPromptInput.ts` (202 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - React hooks (`useEffect`, `useCallback`, `useMemo`, refs)
  - Store entry points in `@/stores/*`
  - Renderer IPC bridge (`window.sero.*`) for agent/container/github/editor/user-feedback interactions
- Upstream callers:
  - Hook modules are imported by ~12 files, mostly `components/layout/ChatPanel.tsx`, explorer UI, and shell startup layers.
- Downstream dependencies:
  - `useSessionAgent` depends on `agent`, `sessions`, `workspace`, and `container` stores simultaneously.
  - `useWorkspaceFiles` depends on `window.sero.editor.exec` shell command execution and is consumed by prompt-input completion.

## Architectural notes
- This folder is thin by LOC, but high-impact in orchestration: hooks decide when state mutations and IPC calls happen.
- Most `useEffect` usage here is legitimate external side-effect wiring (IPC listeners, DOM listeners, async startup fetches).
- `useDebouncedCallback.ts` is already the canonical debounce helper and is referenced by stores/lib code, consistent with repository conventions.

## Surprising discoveries
- `useSessionAgent.ts` is effectively a mini-orchestrator with three separate effects and intentionally suppressed exhaustive-deps checks.
- `useWorkspaceFiles.ts` uses a module-global cache map keyed by workspace ID with TTL but no explicit size bound/eviction policy.
- Chat prompt handling duplicates built-in command handling in both menu-select and free-text submit paths (`/login`, `/logout`).

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 12 (was 9)
- Largest file: `apps/desktop/src/hooks/useWorkspaceFiles.ts` (214 LOC)
- Files over 500 LOC: none (was none)
- Exhaustive-deps suppressions in `useSessionAgent.ts`: 0 (was 2)

### What changed
- Split `useSessionAgent` into focused orchestration hooks under
  `apps/desktop/src/hooks/session-agent/` while keeping `useSessionAgent.ts` as the public wrapper.
- Added debounced idle-triggered session refresh via `useDebouncedCallback(..., 200)`.
- Reworked `useWorkspaceFiles` cache to keep TTL semantics while adding max-entry eviction and
  stale-entry clearing on load failure.

### Still outstanding
- Built-in `/login` / `/logout` command handling is still duplicated in `useChatPromptInput.ts`.
- GitHub auth copy-status timer duplication in `useGitHubAuthFlow.ts` is still pending.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 18 (was 12)
- Total LOC: 1,929 (was 939)
- Largest file: `apps/desktop/src/hooks/useWorkspaceFiles.ts` (271 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): none
- Type escape hatches remaining: none introduced in this pass

### What changed
- Added a shared built-in command helper in `useChatPromptInput.ts` so slash-menu selection and raw prompt submit no longer duplicate `/login` / `/logout` routing logic.
- Added one transient copy-state helper in `useGitHubAuthFlow.ts` so copy success/failure feedback shares timer cleanup and reset behavior.
- Added focused hook coverage in `useChatPromptInput.test.tsx` and `useGitHubAuthFlow.test.tsx`, and re-ran the onboarding GitHub-step regression tests that exercise `refreshStatus()`.

### Still outstanding
- None — the folder plan is fully executed.
