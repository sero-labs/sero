# Facts — apps/desktop/src/types

_Last reviewed: 2026-04-15_

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
  - `@sero-ai/common` (plugin/model validation contracts)
  - `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` (model/thinking + local model compat)
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

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 30 (was 27)
- Total LOC: 3,318 (was 3,323)
- Largest file: `apps/desktop/src/types/electron.d.ts` (496 LOC)
- Files over 500 LOC: none (was `ipc.ts` at 544 before the High pass)
- Remaining near-cap files (≥450 LOC): `electron.d.ts` (496), `ipc-channels.ts` (483), `ipc.ts` (466)

### What changed
- Canonicalized `ProfileInfo` into `apps/desktop/src/types/profile.ts` so renderer + main-process
  profile flows share one contract source.
- Broke the type-only `ipc.ts` ↔ `plugins.ts` cycle by importing `SeroAppManifest` directly from
  `apps/desktop/src/types/sero-apps.ts`.
- Unified dashboard/app widget manifest shapes through
  `apps/desktop/src/types/widget-manifest.ts`.

### Still outstanding
- User-feedback transport types are still duplicated between desktop and
  `plugins/sero-user-feedback-plugin/shared/types.ts`.
- `ipc.ts` still re-exports `IpcChannels`, and the wider codebase still has remaining consumers that
  should move to `@/types/ipc-channels`.
- `electron.d.ts` remains near-cap and still needs the low-priority declaration-hygiene cleanup pass.

## Post-fix snapshot — 2026-04-15 (IpcChannels decoupling follow-up)

### Metrics after fixes
- Total files: 30 (was 30)
- Total LOC: 3,277 (was 3,318)
- Largest file: `apps/desktop/src/types/electron.d.ts` (489 LOC)
- Files over 500 LOC: none (unchanged)
- Remaining near-cap files (≥450 LOC): `electron.d.ts` (489), `ipc-channels.ts` (487), `ipc.ts` (465)

### What changed
- Removed the `IpcChannels` re-export from `apps/desktop/src/types/ipc.ts` so channel constants stay
  scoped to their dedicated `ipc-channels` owner module.
- Migrated all remaining Electron IPC + test imports that previously pulled `IpcChannels` from
  `@/types/ipc` to `@/types/ipc-channels` (64 imports now point directly at the channels module).
- Kept payload/domain contract imports on `@/types/ipc` while decoupling channel constants, reducing
  contract fanout from the `ipc.ts` compatibility barrel.

### Still outstanding
- `apps/desktop/src/types/electron-workspace.d.ts` still has the low-priority `notification: any`
  declaration-hygiene gap.
- `apps/desktop/src/types/collaboration.ts` still has the `maxRounds` comment/default mismatch
  (`default: 3` comment vs `DEFAULT_DEBATE_CONFIG.maxRounds = 1`).
- User-feedback duplication from the original plan should be revalidated against current
  `@sero-ai/common` ownership before marking that item obsolete.

## Post-fix snapshot — 2026-04-15 (declaration-hygiene follow-up)

### Metrics after fixes
- Total files: 30 (was 30)
- Total LOC: 3,278 (was 3,277)
- Largest file: `apps/desktop/src/types/electron.d.ts` (489 LOC)
- Files over 500 LOC: none (unchanged)
- Remaining near-cap files (≥450 LOC): `electron.d.ts` (489), `ipc-channels.ts` (487), `ipc.ts` (465)

### What changed
- Replaced the lingering `notification: any` callback payload in
  `apps/desktop/src/types/electron-workspace.d.ts` with `LspNotification`.
- Wired the declaration to canonical LSP protocol contracts via
  `@/lsp/lsp-protocol`, so preload API typing now matches renderer LSP consumers.

### Still outstanding
- `apps/desktop/src/types/collaboration.ts` still has the `maxRounds` comment/default mismatch
  (`default: 3` comment vs `DEFAULT_DEBATE_CONFIG.maxRounds = 1`).
- User-feedback duplication from the original plan should be revalidated against current
  `@sero-ai/common` ownership before marking that item obsolete.

## Post-fix snapshot — 2026-04-15 (comment/default drift follow-up)

### Metrics after fixes
- Total files: 30 (was 30)
- Total LOC: 3,278 (was 3,278)
- Largest file: `apps/desktop/src/types/electron.d.ts` (489 LOC)
- Files over 500 LOC: none (unchanged)
- Remaining near-cap files (≥450 LOC): `electron.d.ts` (489), `ipc-channels.ts` (487), `ipc.ts` (465)

### What changed
- Corrected the `DebateConfig.maxRounds` inline default comment in
  `apps/desktop/src/types/collaboration.ts` from `default: 3` to `default: 1` so docs now match
  `DEFAULT_DEBATE_CONFIG.maxRounds = 1`.

### Still outstanding
- User-feedback duplication from the original plan should be revalidated against current
  `@sero-ai/common` ownership before marking that item obsolete.

## Post-fix snapshot — 2026-04-15 (user-feedback revalidation follow-up)

### Metrics after fixes
- Total files: 30 (was 30)
- Total LOC: 3,279 (was 3,278)
- Largest file: `apps/desktop/src/types/electron.d.ts` (489 LOC)
- Files over 500 LOC: none (unchanged)
- Remaining near-cap files (≥450 LOC): `electron.d.ts` (489), `ipc-channels.ts` (487), `ipc.ts` (465)

### What changed
- Revalidated that user-feedback transport interfaces (`UserFeedbackQuestion*`,
  `UserFeedbackPendingQuestion`, `UserFeedbackAnswer`, `UserFeedbackResponse`) are owned only by
  `packages/common/src/user-feedback.ts`.
- Confirmed both desktop (`apps/desktop/src/types/user-feedback.ts`) and plugin
  (`plugins/sero-user-feedback-plugin/shared/types.ts`) consume those transport contracts from
  `@sero-ai/common` instead of maintaining duplicated local copies.
- Clarified the desktop `src/types/user-feedback.ts` header comment so ownership boundaries are explicit:
  desktop owns response-feedback persistence contracts, while transport contracts stay canonical in
  `@sero-ai/common`.

### Still outstanding
- None for the currently tracked `apps/desktop/src/types` follow-up backlog.
