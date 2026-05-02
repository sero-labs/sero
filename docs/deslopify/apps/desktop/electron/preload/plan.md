# Refactoring Plan — apps/desktop/electron/preload

_Plan drafted: 2026-04-12_

## Executive Summary
Preload bridge coverage is broad and mostly consistent, but contract safety is weaker than it
should be for such a critical boundary: no direct compile-time guard between implementation and
`window.sero` declarations, near-cap aggregation in `api.ts`, and lingering `any`/`unknown`
signatures at IPC edges. The target outcome is a stricter, slimmer preload layer with explicit
contract enforcement and reduced coupling to the `@/types/ipc` mega-barrel.

## Issues Found (prioritized)
- **High** — ⊘ obsolete — compile-time preload contract conformance was already present before this pass via `const seroApiContract = seroPreloadApi satisfies SeroAPI` in `apps/desktop/electron/preload.ts` (revalidated 2026-04-16). Effort: **S**.

- **Medium** — ~~`api.ts` is near cap and still aggregates too many domains in one object —
  `apps/desktop/electron/preload/api.ts:89-483` bundles profiles, workspaces, agent, VCS,
  terminal, editor, and integration wiring. One additional domain likely crosses 500 LOC.~~ ✅ 2026-04-12 (split into `preload/api/core.ts` + `preload/api/workbench.ts`; `api.ts` now 88 LOC)
  Effort: **M**.

- **Medium** — ~~Preload modules are coupled to `@/types/ipc` for channel constants, not the dedicated
  channels module — all 14 files in this folder import `IpcChannels` from `@/types/ipc`
  (example: `apps/desktop/electron/preload/api.ts:2`). This increases blast radius for
  `ipc.ts` edits and reinforces mega-barrel coupling.~~ ✅ 2026-04-12 (all preload `IpcChannels` imports now use `@/types/ipc-channels`). Effort: **S**.

- **Medium** — ~~Weak public typings (`any`/`unknown`) leak across preload IPC boundaries — `apps/desktop/electron/preload/integrations/google-imagegen.ts:16-17,26`, `apps/desktop/electron/preload/editor/debug-lsp.ts:45-51`, and `apps/desktop/electron/preload/apps/app-domain.ts:95` expose untyped payloads/results despite existing domain contracts in type declarations.~~ ✅ 2026-04-16 (`d6f91eb1`) Effort: **M**.

- **Low** — ~~Layout bridge uses ad-hoc shape instead of canonical layout contracts — `apps/desktop/electron/preload/platform/host-services.ts:21-24` narrows layout save/load to a partial inline object, while declared API expects `LayoutState` / `LoadedLayoutState` (`apps/desktop/src/types/electron.d.ts:264-268`).~~ ✅ 2026-04-16 (`d6f91eb1`) Effort: **S**.

## Proposed Refactoring
1. **Enforce preload API contract conformance at compile time.**
   - Introduce a typed contract source for preload (exportable interface/type), then apply
     `satisfies` or explicit annotation to `seroPreloadApi` before `exposeInMainWorld`.
   - Keep this check in build/typecheck so drift is caught immediately.
   - Aligns with AD-008 and the 4-layer IPC integrity rule.

2. **Split `api.ts` into domain composition modules before cap breach.**
   - Target shape: `preload/api/{workspace.ts,agent.ts,vcs.ts,terminal.ts,editor.ts,services.ts}`
     plus a thin `api.ts` composer.
   - Keep implementation files focused on one IPC namespace each.

3. **Decouple channel constants from `@/types/ipc` in preload.**
   - Import `IpcChannels` from `@/types/ipc-channels` everywhere in preload.
   - Reserve `@/types/ipc` imports for payload contracts only.

4. **Replace `any`/`unknown` bridge signatures with canonical types.**
   - Type Google auth events and imagegen params/results explicitly.
   - Type LSP notification payloads as `unknown` + narrow helper (or a concrete notification union).
   - Replace `gitAppBridge.run` unknown params/result with dedicated action/result interfaces.

5. **Align host-service bridges with canonical type contracts.**
   - Use `LayoutState` / `LoadedLayoutState` in `layoutBridge` signatures.
   - Remove inline shape duplication across preload + declaration layers.

## Benefits & Trade-offs
- Benefits: stronger contract guarantees at the preload boundary, lower drift risk between
  declarations and implementation, and better maintainability as IPC surface area grows.
- Trade-offs: moderate refactor churn across preload modules and imports; temporary migration
  overhead while moving `IpcChannels` consumers.

## Dependencies & Risks
- Depends on `src/types` contract cleanup (especially `ipc.ts` split) to avoid duplicated churn.
- Contract tightening can surface latent IPC mismatches in `electron/ipc/**`, requiring coordinated fixes.
- API conformance enforcement may fail fast on existing weakly typed methods; budget time for type repair.

## Next Steps
1. None — folder plan fully executed 2026-04-16.

## Execution log
- 2026-04-16 — `d6f91eb1` `refactor(desktop-preload): tighten preload bridge types`
- 2026-04-12 — Medium Wave E1 (working tree): split `preload/api.ts` into `preload/api/core.ts` + `preload/api/workbench.ts` and moved preload-wide `IpcChannels` imports onto `@/types/ipc-channels`.
