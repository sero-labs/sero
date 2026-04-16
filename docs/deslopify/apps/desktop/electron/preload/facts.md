# Facts — apps/desktop/electron/preload

_Last reviewed: 2026-04-12_

## What this code does
This folder implements the renderer-safe bridge (`window.sero`) by wrapping
`ipcRenderer.invoke/send/on` calls into typed domain APIs (agent, workspace,
auth, collaboration, editor/LSP, plugins, gateway, etc.). `preload.ts` exposes
`seroPreloadApi` into the isolated renderer via `contextBridge`.

## Shape & metrics
- Total files: 14
- Total LOC: 1,119
- Largest file: `apps/desktop/electron/preload/api.ts` (483 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC):
  - `apps/desktop/electron/preload/api.ts` (483)
- External dependencies of note:
  - Electron preload primitives: `ipcRenderer`, `contextBridge`
  - Shared contracts from `@/types/ipc`, `@/types/vcs`, `@/types/theme`
- Upstream callers:
  - `apps/desktop/electron/preload.ts` exposes `seroPreloadApi` directly
  - Renderer code consumes this via global `window.sero` declarations in `src/types/electron*.d.ts`
- Downstream dependencies:
  - `apps/desktop/electron/ipc/**` handler signatures through `IpcChannels`
  - `apps/desktop/src/types/ipc.ts` and related type modules

## Architectural notes
- This folder is the preload leg of the 4-layer IPC rule (React → store → preload → main).
  Any type drift here breaks the core contract boundary.
- AD-008 (preload bridge boundary) and AD-018/AD-021 surfaces (container/subagent)
  are materially represented here through channel wrappers.
- `api.ts` acts as the aggregate object that wires all domain bridges; current size is one
  feature away from breaching the 500 LOC cap.

## Surprising discoveries
- `contextBridge.exposeInMainWorld('sero', seroPreloadApi)` currently has no compile-time
  conformance check against the declared `SeroAPI` contract (`electron/preload.ts:4`), so
  implementation/declaration drift can slip through.
- All 14 preload modules import `IpcChannels` from `@/types/ipc` instead of the dedicated
  `@/types/ipc-channels` module, pulling in the monolithic type barrel everywhere.
- Public preload bridges still expose loose `any`/`unknown` contracts at key boundaries:
  `integrations/google-imagegen.ts:16-17,26`, `editor/debug-lsp.ts:45-51`,
  and `apps/app-domain.ts:95`.

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 16 (was 14)
- Largest file: `apps/desktop/electron/preload/apps/app-domain.ts` (207 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥450 LOC): none (was `api.ts` at 483 LOC)
- `IpcChannels` imports from `@/types/ipc`: 0 preload files (was 14)

### What changed
- Split the aggregate preload bridge into focused composition modules:
  `apps/desktop/electron/preload/api/core.ts` and
  `apps/desktop/electron/preload/api/workbench.ts`.
- Reduced `apps/desktop/electron/preload/api.ts` from 485 → 88 LOC so it is now a thin composer.
- Moved preload-wide channel imports onto `@/types/ipc-channels` to decouple the folder from the
  `@/types/ipc` mega-barrel for constants-only usage.

### Still outstanding
- Weakly typed bridge surfaces in `integrations/google-imagegen.ts`, `editor/debug-lsp.ts`, and
  `apps/app-domain.ts` still need canonical payload/result typing.
- Low-priority layout bridge shape duplication is still pending.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 16 (unchanged from the first preload split pass)
- Total LOC: 1,144 (was 1,119 at initial review)
- Largest file: `apps/desktop/electron/preload/apps/app-domain.ts` (218 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC): none
- Type escape hatches remaining: 0

### What changed
- Revalidated that `preload.ts` already enforces compile-time `SeroAPI` conformance with `satisfies`, closing the stale High tracker without reopening the boundary.
- Replaced remaining weak Google/imagegen and LSP subscription payload typing with concrete contracts and kept the existing typed `gitApp` / `webApp` bridge shapes intact.
- Aligned the layout bridge with canonical `LayoutState` / `LoadedLayoutState` contracts so preload and renderer declarations share one shape.
- Extended preload subscription coverage to lock the typed Google and LSP listener teardown behavior.

### Still outstanding
- None.
