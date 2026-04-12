# Refactoring Plan — apps/desktop/src/types

_Plan drafted: 2026-04-12_

## Executive Summary
`src/types` is functionally solid but structurally over-coupled: one hard 500-LOC violation,
a near-cap declaration cluster, and a central `ipc.ts` barrel that now owns too many unrelated
contracts. The goal is to restore strict contract ownership by splitting `ipc.ts`, removing
cycles/duplicates, and tightening declaration hygiene so preload + IPC changes remain safe and
reviewable.

## Issues Found (prioritized)
- **High** — `ipc.ts` violates the hard 500 LOC cap and mixes too many ownership domains —
  `apps/desktop/src/types/ipc.ts:1-544` remains above the file-size limit while containing
  profiles, workspace/session contracts, auth, user-feedback, gateway, app-control exports,
  and channel re-exports. This is the highest-risk contract surface in Wave A. Effort: **M**.

- **High** — Preload declaration contract has an unimported subagent type masked by declaration skipping —
  `apps/desktop/src/types/electron.d.ts:55-56` imports subagent types but omits `SubagentAgentFile`,
  yet `SubagentAgentFile` is used at `electron.d.ts:343` and `electron.d.ts:345`. With
  `apps/desktop/tsconfig.json` using `skipLibCheck`, this can silently degrade API type safety.
  Effort: **S**.

- **Medium** — Manual duplicated cross-process contracts create drift risk in profile and user-feedback APIs —
  `apps/desktop/src/types/ipc.ts:13-27` duplicated `ProfileInfo` from
  `apps/desktop/electron/features/profile/types.ts:39-49`; user-feedback shapes are mirrored in
  `apps/desktop/src/types/ipc.ts:410-455` and
  `plugins/sero-user-feedback-plugin/shared/types.ts:10-72`. ProfileInfo was canonicalized into
  `apps/desktop/src/types/profile.ts` on 2026-04-12, but user-feedback duplication still remains.
  This fights the canonical-type rule and increases AD-022/extension drift risk. Effort: **M**.

- **Medium** — ~~Type-layer cycle between `ipc.ts` and `plugins.ts` increases coupling and review complexity —
  `apps/desktop/src/types/plugins.ts:1` imports `SeroAppManifest` from `./ipc`, while
  `apps/desktop/src/types/ipc.ts:320` re-exports plugin types from `./plugins`.~~ ✅ 2026-04-12 (`plugins.ts` now imports `SeroAppManifest` from `./sero-apps`)
  Effort: **S**.

- **Medium** — `IpcChannels` consumption is routed through the monolithic `ipc.ts` barrel instead of the
  dedicated channels module — `apps/desktop/src/types/ipc.ts:544` re-exports channels, and 59 files
  import `IpcChannels` from `@/types/ipc` rather than `@/types/ipc-channels` (example:
  `apps/desktop/electron/preload/api.ts:2`). This widens dependency fanout and slows safe contract edits.
  Effort: **M**.

- **Medium** — ~~Widget manifest contract is duplicated across files —
  `apps/desktop/src/types/dashboard.ts:15-32` (`WidgetManifest`) and
  `apps/desktop/src/types/sero-apps.ts:10-25` (`SeroWidgetManifest`) define the same shape.~~ ✅ 2026-04-12 (both now share `src/types/widget-manifest.ts`)
  Effort: **S**.

- **Low** — `any` leak in LSP preload API declaration weakens strict typing —
  `apps/desktop/src/types/electron-workspace.d.ts:79` uses `notification: any`.
  Effort: **S**.

- **Low** — Comment/default mismatch in collaboration debate config —
  `apps/desktop/src/types/collaboration.ts:50` documents `maxRounds` default as 3, while
  `DEFAULT_DEBATE_CONFIG.maxRounds` is 1 at `collaboration.ts:60`. Effort: **S**.

## Proposed Refactoring
1. **Split `ipc.ts` into domain modules and keep `ipc.ts` as a thin compatibility barrel.**
   - Move concrete interfaces into `src/types/ipc/` (e.g. `profiles.ts`, `workspace.ts`,
     `sessions.ts`, `auth.ts`, `feedback.ts`, `network.ts`, `github.ts`, `app-control.ts` alias exports).
   - Keep root `ipc.ts` as re-export-only (target <150 LOC) for migration stability.
   - Aligns with the Wave A objective and the 4-layer IPC contract discipline.

2. **Fix declaration hygiene in `electron.d.ts` and tighten declaration checking.**
   - Import `SubagentAgentFile` explicitly and verify all referenced symbols are imported.
   - Audit for other hidden declaration gaps while touching the file.
   - Optionally add a focused declaration-check script (without full `skipLibCheck`) for `src/types/*.d.ts`.

3. **Canonicalize duplicated cross-process contracts.**
   - Promote shared profile/user-feedback transport types to a neutral shared contract module
     (prefer `@sero/common` for renderer-safe types) and import from both renderer and Electron/plugin sides.
   - Remove “KEEP IN SYNC” manual duplication comments once canonical source is in place.
   - Aligns with AD-022 reliability goals and avoids extension drift.

4. **Break the type-only cycle and isolate manifests.**
   - Change `plugins.ts` to import `SeroAppManifest` from `./sero-apps` directly.
   - Keep plugin event and plugin metadata types in a one-way dependency chain.

5. **Decouple channel constants from the `ipc.ts` mega-barrel.**
   - Update imports to use `@/types/ipc-channels` for `IpcChannels`.
   - Keep `@/types/ipc` for payload/type contracts only.
   - Further split `ipc-channels.ts` by domain before it crosses 500 LOC.

6. **Remove remaining low-grade type/documentation drift.**
   - Replace `notification: any` with a stricter type (`unknown` or a dedicated LSP notification shape).
   - Correct debate config comments to match actual defaults.
   - Unify widget manifest interface (single source, with alias export if needed).

## Benefits & Trade-offs
- Benefits: clearer ownership boundaries, lower IPC drift risk, easier preload/main signature reviews,
  reduced accidental coupling, and stronger declaration safety.
- Trade-offs: broad import-path churn (many files touch), temporary dual-export compatibility layers,
  and higher short-term review volume while modules are re-homed.

## Dependencies & Risks
- Requires coordinated updates with `electron/preload/**` and `electron/ipc/**` imports because this
  folder is central to both layers.
- Any type relocation must preserve public import stability (`@/types/ipc`) during migration to avoid
  breaking 170+ callers in one shot.
- If shared types move to `@sero/common`, keep them renderer-safe (no Electron/Node runtime imports).

## Next Steps
1. Execute High item: split `ipc.ts` below 500 LOC with domain modules + compatibility barrel.
2. Fix `electron.d.ts` subagent type import gap and run typecheck.
3. ~~Land cycle break (`plugins.ts` → `sero-apps.ts`) and widget-manifest unification.~~ ✅ 2026-04-12
4. Continue converting `IpcChannels` imports to `@/types/ipc-channels` in preload/ipc modules.
5. Queue follow-up deslopify for `apps/desktop/electron/preload` next (Wave A step 2).

## Execution log
- 2026-04-12 — Medium Wave E3 (working tree): canonicalized `ProfileInfo` into `src/types/profile.ts`, broke the `ipc.ts` ↔ `plugins.ts` type cycle, and unified widget manifests through `src/types/widget-manifest.ts`.
