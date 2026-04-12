# Refactoring Plan — apps/desktop

_Plan drafted: 2026-04-12_

## Executive Summary
Phase 0 baseline confirms one hard-rule file-size violation and a large near-cap
cluster in IPC/contracts/orchestration code. The right scheduling move is still
core-first: stabilize type and boundary ownership (types, preload, IPC, platform
owners, stores/hooks/lib) before touching shell/app-surface modules. This plan
locks that sequence and defines the first deslopify wave scope.

## Issues Found (prioritized)
- **High** — 500 LOC cap violation in core IPC contract file —
  `apps/desktop/src/types/ipc.ts:1-544` exceeds the hard 500 LOC rule and is the
  highest-risk shared contract file for renderer↔main drift. Effort: **M**.

- **Medium** — Contract modules are concentrated near the 500 LOC ceiling —
  `apps/desktop/electron/ipc/agent/core/agent.ts:1-498`,
  `apps/desktop/electron/preload/api.ts:1-483`,
  `apps/desktop/src/types/ipc-channels.ts:1-483`, and
  `apps/desktop/src/stores/agent.ts:1-489` are all one feature away from hard
  violation, increasing refactor cost and review load. Effort: **M**.

- **Medium** — Ownership boundaries span many files before app surfaces are touched —
  `apps/desktop/electron/ipc/**` (69 files), `apps/desktop/src/types/**` (27 files),
  and `apps/desktop/src/stores/**` (29 files) indicate contract-first sequencing is
  mandatory to avoid symptom-level UI fixes. Effort: **S** (planning alignment).

- **Low** — No immediate storage-policy violation detected in production paths —
  baseline scan found no active `localStorage`/`sessionStorage` usage in
  `apps/desktop/src` or `apps/desktop/electron` app code, so no emergency policy
  cleanup is needed before Wave A starts. Effort: **S**.

## Proposed Refactoring
1. **Execute Wave A deslopify reviews in strict order (no source edits yet).**
   - Start with `src/types`, then `electron/preload`, then `electron/ipc`.
   - Continue through platform owners (`electron/features/{workspace,agent,container,apps,plugins}`, `electron/shared`, `electron/platform`).
   - Finish core renderer orchestration (`src/stores`, `src/hooks`, `src/lib`).
   - Why: aligns with the 4-layer IPC contract rule and AD-018/AD-020/AD-021.

2. **Split `src/types/ipc.ts` during the matching fix-slop wave.**
   - Target shape: `src/types/ipc/{agent.ts, workspace.ts, profiles.ts, tools.ts, index.ts}`
     with `index.ts` as the public barrel.
   - Keep canonical imports from shared/Pi SDK types; avoid parallel type redeclarations.

3. **Pre-emptively partition near-cap contract files before they cross 500 LOC.**
   - `preload/api.ts`: split by domain bridge modules (agent/workspace/layout/debug/etc.).
   - `ipc/agent/core/agent.ts`: separate orchestration, event routing, and session helpers.
   - `stores/agent.ts`: extract command/event reducers vs. persistence/selectors.

4. **Track cross-cutting drift patterns in each Wave A plan.**
   - Require each folder plan to call out: IPC type drift risk, boundary leakage,
     and duplicated helper opportunities.
   - Consolidate before Wave B batching.

## Benefits & Trade-offs
- Benefits: reduces contract-regression risk, prevents 500+ LOC creep, and keeps
  fix-slop batches focused on foundational modules with high downstream impact.
- Trade-offs: front-loads planning/review effort before visible UI cleanup; requires
  disciplined sequencing so contributors do not jump to shell/components early.

## Dependencies & Risks
- Depends on completing all Wave A deslopify docs first; fixing in parallel would
  create churn as boundary assumptions change.
- Type moves may require coordinated updates across preload and main IPC handlers to
  preserve signature parity.
- If container tooling paths are changed later (`images/Dockerfile.sero-node`), follow
  the required image rebuild/recreate protocol from project guidance.

## Next Steps
1. Run `deslopify apps/desktop/src/types`.
2. Run `deslopify apps/desktop/electron/preload`.
3. Run `deslopify apps/desktop/electron/ipc`.
4. Continue remaining Wave A targets in listed order.
5. After all Wave A plans exist, schedule Wave B `fix-slop` High-only batches.
