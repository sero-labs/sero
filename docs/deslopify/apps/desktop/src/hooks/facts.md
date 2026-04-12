# Facts — apps/desktop/src/hooks

_Last reviewed: 2026-04-12_

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
