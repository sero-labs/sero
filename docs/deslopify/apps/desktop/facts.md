# Facts — apps/desktop

_Last reviewed: 2026-04-12_

## What this code does
`apps/desktop` is the Electron host + React renderer for Sero. It owns shell UI,
agent session orchestration, IPC contracts, preload bridges, container-backed tool
execution, and plugin/runtime integration points.

## Shape & metrics
- Total files scanned (`src` + `electron`, TS/JS): 621
- Largest file: `apps/desktop/src/types/ipc.ts` (544 LOC)
- Files over 500 LOC: `apps/desktop/src/types/ipc.ts` (544)
- Near-cap files (≥470 LOC):
  - `apps/desktop/electron/ipc/agent/core/agent.ts` (498)
  - `apps/desktop/electron/features/plugins/manager.ts` (494)
  - `apps/desktop/src/types/electron.d.ts` (492)
  - `apps/desktop/electron/features/subagent/index.ts` (491)
  - `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491)
  - `apps/desktop/src/stores/agent.ts` (489)
  - `apps/desktop/electron/features/gateway/index.ts` (488)
  - `apps/desktop/src/components/profiles/OnboardingWizard.tsx` (486)
  - `apps/desktop/src/types/ipc-channels.ts` (483)
  - `apps/desktop/electron/preload/api.ts` (483)
  - `apps/desktop/electron/features/container/tools/tools-browser-agent.ts` (483)
  - `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` (480)
- Highest-LOC areas (directory totals):
  - `apps/desktop/src/components/layout` (~15,908 LOC)
  - `apps/desktop/src/components/apps` (~7,105 LOC)
  - `apps/desktop/electron/features/kanban` (~6,702 LOC)
  - `apps/desktop/electron/features/container` (~4,751 LOC)
  - `apps/desktop/electron/ipc/agent` (~3,708 LOC)
- Contract/boundary hotspots (Phase A scope):
  - `apps/desktop/src/types` — 27 files / 3,323 LOC (largest: `src/types/ipc.ts` 544)
  - `apps/desktop/electron/preload` — 14 files / 1,119 LOC (largest: `preload/api.ts` 483)
  - `apps/desktop/electron/ipc` — 69 files / 8,602 LOC (largest: `ipc/agent/core/agent.ts` 498)
  - `apps/desktop/src/stores` — 29 files / 5,377 LOC (largest: `stores/agent.ts` 489)

## Architectural notes
- AD-018, AD-020, and AD-021 make `electron/ipc`, `electron/features/container`,
  and agent/subagent paths high-risk for contract drift.
- The four-layer IPC rule from project conventions (React → store → preload → main)
  puts `src/types/ipc.ts`, `src/types/ipc-channels.ts`, `electron/preload/api.ts`,
  and `electron/ipc/**` at the center of most regression risk.
- Baseline grep found no active renderer `localStorage`/`sessionStorage` writes in
  app code (excluding comments/tests), which aligns with current layout persistence
  guidance.

## Surprising discoveries
- Only one strict 500+ LOC violation exists right now (`src/types/ipc.ts`), but there
  is a dense cluster of near-cap files in core contract and orchestration modules.
- `electron/ipc` already spans 69 source files and 8.6k LOC, so Wave A sequencing is
  still the correct first move before app-surface cleanups.
