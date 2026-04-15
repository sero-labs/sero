# Facts — apps/desktop/src/stores

_Last reviewed: 2026-04-15_

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

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 29 (was 29)
- Largest file: `apps/desktop/src/stores/agent.ts` (461 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): `agent.ts` (461), `app.ts` (460) — `agent.ts` dropped from 495 LOC

### What changed
- Extracted shared optimistic user-message enqueue into `appendOptimisticUserMessage()` so
  prompt/steer/collaboration flows now share one renderer-side message shape + ID path.
- Added `clearAgentSessionBuffers()` to clear pending memory context and buffered deltas when
  sessions close, error, or finish after the store has already forgotten them.
- Tightened `closeSession()` / failed `openSession()` cleanup so renderer-owned session buffers are
  pruned alongside the store entry.

### Still outstanding
- `apps/desktop/src/stores/agent.ts` is healthier but still broad; a deeper ownership split is
  optional follow-up if the file starts growing again.
- Low-priority selector churn cleanup is still pending.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 35 (was 29)
- Largest file: `apps/desktop/src/stores/agent-utils.ts` (397 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): none (was `agent.ts` + `app.ts`)

### What changed
- Split the near-cap `apps/desktop/src/stores/app.ts` ownership seams into
  `stores/app/{state,layout-hydration,discovery,listeners,shared}.ts`.
- Kept `stores/app.ts` as a thin compatibility barrel so existing imports and test surfaces
  continue to work unchanged.
- Isolated app discovery/plugin-change reconciliation and layout hydration into focused modules,
  reducing the blast radius for future app-store edits.

### Still outstanding
- Low-priority selector churn cleanup (`agent-selectors.ts`, `sessions.ts`) remains pending.
- `agent.ts` no longer has cap pressure, but a deeper split is still optional if future growth
  trends upward.
