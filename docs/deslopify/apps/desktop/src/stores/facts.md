# Facts — apps/desktop/src/stores

_Last reviewed: 2026-04-12_

## What this code does
`src/stores` is the renderer orchestration layer for Sero’s desktop shell. It owns shell layout state, app discovery state, workspace/session selection, active agent message streams, container/VCS/subagent runtime state, and several cross-app UI bridges (dashboard widgets, feedback, editor open requests, context overrides, model preferences).

## Shape & metrics
- Total files: 29
- Total LOC: 5,377
- Largest file: `apps/desktop/src/stores/agent.ts` (489 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC):
  - `apps/desktop/src/stores/agent.ts` (489)
  - `apps/desktop/src/stores/app.ts` (460)
- External dependencies of note:
  - `zustand` + `zustand/react/shallow`
  - IPC contracts from `@/types/ipc` (agent/workspace/session/app/plugin/theme/container)
  - `react-grid-layout` layout types via dashboard store
- Upstream callers:
  - Store modules are imported from ~83 files across `apps/desktop/src` + `apps/desktop/electron`.
  - Most heavily consumed modules are `agent.ts`, `app.ts`, `workspace.ts`, `sessions.ts`.
- Downstream dependencies:
  - `window.sero.*` preload APIs are the hard boundary for almost every action in this folder.
  - `persistLayout()` is used by shell/model/dashboard/session/workspace flows, making this folder central to layout persistence correctness.

## Architectural notes
- This folder is the renderer side of the React → Zustand → preload → IPC → main pipeline. If store updates and IPC outcomes diverge, shell state can drift from persisted/main-process truth.
- `agent.ts` and `app.ts` currently act as orchestration hubs (session lifecycle + streaming events; app discovery + plugin-change handling + layout hydration), which increases blast radius for changes.
- Container lifecycle orchestration in `useSessionAgent` relies on store methods from both `agent` and `container`, matching AD-018’s “container available per workspace session” behavior.

## Surprising discoveries
- Destructive actions are optimistic in multiple places (`agent.closeSession`, `workspace.closeWorkspace`) and can remove renderer state even if IPC fails.
- `agent-utils.ts` keeps module-level `pendingMemoryContext` state that is only cleared on `message_start`; session-close/error paths do not explicitly prune leftover entries.
- A lot of quality work already happened here: no `any`/`@ts-ignore` escapes in production store code, and no source files currently violate the 500 LOC cap.
