# Refactoring Plan — apps/desktop

_Plan drafted: 2026-04-12 • Wave B synthesis added: 2026-04-12_

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

## Wave B synthesis — 2026-04-12

### Cross-cutting themes across all Wave A plans
1. **Contract drift is concentrated on the IPC spine, not in isolated folders.**
   - `src/types`, `electron/preload`, and `electron/ipc` all found variants of the
     same core problem: canonical contracts exist, but conformance is weak and
     `any`/compat barrels are masking drift.
   - The High type-escape findings in `electron/features/apps` belong to this same
     family because they sit on extension/agent boundaries.
   - Result: the first `fix-slop` batch should harden the contract spine end to
     end instead of treating each folder as unrelated cleanup.

2. **Lifecycle and failure semantics are inconsistent across runtime owners.**
   - `src/stores` found optimistic destructive actions that can desync renderer and
     main state.
   - `electron/features/apps` found watcher bootstrap/refcount races.
   - `electron/features/container` found stale port/orphan bridge lifecycle leaks.
   - `src/lib` found sticky transient failures in federated component loading.
   - Result: these should be grouped as one runtime-integrity batch focused on
     explicit recovery behavior, teardown symmetry, and retryability.

3. **Malformed settings/config handling currently fails open in more than one layer.**
   - `electron/shared` and `electron/features/plugins` independently found
     destructive `settings.json` parse-fallback flows.
   - `electron/features/plugins` also found plugin discovery taxonomy drift, which
     is the discoverability-contract sibling of the same host-boundary problem.
   - Result: settings safety and plugin discovery should move together so the host
     has one clear non-destructive config contract before more plugin/platform work.

4. **Security hardening should be a dedicated wave, not incidental cleanup.**
   - `electron/features/container` identified an unauthenticated open proxy on all
     host interfaces.
   - `electron/platform` identified a broader-than-needed production CSP.
   - Result: these are the only Wave A High findings that directly widen attack
     surface, so they deserve a focused hardening batch with explicit validation.

5. **Not every Wave A folder actually has High work for Wave B.**
   - `electron/features/workspace`, `electron/features/agent`, and `src/hooks` are
     Medium/Low only in their current plans.
   - Result: do not force artificial Wave B work there just to preserve folder
     order. They should roll into the first Medium wave after the core High
     batches land, unless new Highs appear during execution.

### Recommended High-only `fix-slop` batches
| Batch | Targets | High items covered | Batch intent |
| --- | --- | --- | --- |
| **B1 — IPC contract hardening** | `src/types`, `electron/preload`, `electron/ipc`, `electron/features/apps` (type-safety subset) | Split `src/types/ipc.ts`, fix `electron.d.ts` declaration gap, add preload contract conformance guard, remove unsafe `any`/`as any` escapes from IPC and extension helper boundaries | Lock down the React → store → preload → main contract spine before downstream refactors. |
| **B2 — Settings & discovery safety** | `electron/shared`, `electron/features/plugins` | Make `settings.json` parse/write flows non-destructive and fix plugin discovery taxonomy drift | Establish one safe host config/discovery contract before more plugin/platform work. |
| **B3 — Runtime lifecycle correctness** | `src/stores`, `electron/features/apps` (watcher subset), `electron/features/container` (lifecycle subset), `src/lib` | Make destructive actions IPC-result aware, fix watcher bootstrap/refcount race, fix scanner/bridge teardown leaks, and make federated remote failures retryable | Eliminate stale state, orphan processes/watchers, and sticky blank UI after transient failures. |
| **B4 — Security boundary hardening** | `electron/features/container` (proxy subset), `electron/platform` | Restrict container proxy exposure and tighten production CSP | Keep attack-surface reductions reviewable as one dedicated hardening pass. |

### Wave B targets with no current High items
- Defer to the first Medium wave: `electron/features/workspace`,
  `electron/features/agent`, `src/hooks`.
- Keep Medium file-splitting work (`preload/api.ts`, `ipc/agent/core/agent.ts`,
  `stores/agent.ts`, `plugins/manager.ts`, `shared-infra.ts`) attached to the
  batch that already touches that area, rather than running standalone surgery.

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
1. Execute **Batch B1 — IPC contract hardening** (`src/types` → `electron/preload` → `electron/ipc` → `electron/features/apps` type-safety subset).
2. Execute **Batch B2 — Settings & discovery safety** (`electron/shared` + `electron/features/plugins`).
3. Execute **Batch B3 — Runtime lifecycle correctness** (`src/stores` + `electron/features/apps` watcher work + `electron/features/container` lifecycle work + `src/lib`).
4. Execute **Batch B4 — Security boundary hardening** (`electron/features/container` proxy work + `electron/platform` CSP work).
5. Start the first Medium wave only after those High-only batches land and `workspace`/`agent`/`hooks` are re-evaluated against the updated core boundaries.
