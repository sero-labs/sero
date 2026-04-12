# Facts — apps/desktop/src/types

_Last reviewed: 2026-04-12_

## What this code does
`src/types` is the renderer-facing contract layer for desktop: it defines IPC payloads,
channel constants, `window.sero` preload API declarations, and shared domain shapes
(models, onboarding, collaboration, VCS, plugins, dashboard, etc.). This folder is
consumed by both renderer stores/components and Electron preload/main modules.

## Shape & metrics
- Total files: 27
- Total LOC: 3,323
- Largest file: `apps/desktop/src/types/ipc.ts` (544 LOC)
- Files over 500 LOC:
  - `apps/desktop/src/types/ipc.ts` (544)
- Near-cap files (≥450 LOC):
  - `apps/desktop/src/types/electron.d.ts` (492)
  - `apps/desktop/src/types/ipc-channels.ts` (483)
- Upstream callers:
  - `@/types/ipc` imported by ~170 files under `apps/desktop/{src,electron}`
  - `IpcChannels` imported from `@/types/ipc` (not `@/types/ipc-channels`) in 59 files
- Downstream dependencies of note:
  - `@sero/common` (plugin/model validation contracts)
  - `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` (model/thinking + local model compat)
  - `@electron/features/container/core/types` re-exported as canonical `ContainerInfo`
  - `react-grid-layout` and `react` for dashboard/widget typing

## Architectural notes
- This folder is a key part of the 4-layer IPC path (types → preload bridge → main handlers).
  Any drift here cascades into preload and IPC breakage quickly.
- AD-022 (profiles) is currently represented by duplicated `ProfileInfo` contracts in both
  renderer and electron feature code (`src/types/ipc.ts` and `electron/features/profile/types.ts`).
- AD-021 (subagent) types are routed through `ipc.ts` and `electron.d.ts`; declaration hygiene
  matters because `window.sero` is the renderer’s hard API contract.
- `ipc.ts` currently mixes domain interfaces, cross-file re-exports, and channel re-exports,
  making it a "god barrel" that couples unrelated modules.

## Surprising discoveries
- `apps/desktop/src/types/electron.d.ts` references `SubagentAgentFile` but does not import it
  (`electron.d.ts:55-56`, `electron.d.ts:343`, `electron.d.ts:345`); this can be masked by
  `skipLibCheck` and silently weaken preload API typing.
- `apps/desktop/src/types/plugins.ts` imports `SeroAppManifest` from `./ipc`, while `ipc.ts`
  re-exports plugin types from `./plugins` (`plugins.ts:1`, `ipc.ts:320`), creating a type-only cycle.
- Widget manifest shape is duplicated (`dashboard.ts:15` and `sero-apps.ts:10`) instead of sharing
  a single canonical interface.
