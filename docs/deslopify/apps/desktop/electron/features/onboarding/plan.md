# Refactoring Plan — apps/desktop/electron/features/onboarding

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/onboarding` is compact and mostly understandable, but it currently mixes three concerns that should be cleaner: read-only onboarding-state evaluation, settings-repair side effects, and presentation-shaping helpers borrowed from IPC internals. The code is not in crisis, but it is carrying avoidable boundary drift. The best payoff is to make the onboarding state path explicit and mostly pure, then move shared model/provider presentation helpers out of IPC-owned modules.

## Issues Found (prioritized)
- **Medium** — ~~`getOnboardingState()` performs settings mutations while answering a status query — `apps/desktop/electron/features/onboarding/preflight.ts:101-116` reads settings, applies legacy-provider migration, writes settings back when changed, and triggers unavailable-model cleanup before returning onboarding state. Because the renderer refreshes onboarding state repeatedly, this makes a “get state” IPC call behaviorally closer to a repair command.~~ ✅ 2026-04-16 (`ff22877c`) via explicit read-only `getOnboardingState()` + repair-aware `getOnboardingStateWithRepairs()` / `repairOnboardingSettingsState()` split.

- **Medium** — ~~`provider-health.ts` depends on IPC-layer internals for core feature logic — `apps/desktop/electron/features/onboarding/provider-health.ts:12-25` imports `providerDisplayName` from `@electron/ipc/platform/auth` and `buildAvailableModelGroups` from `@electron/ipc/agent/core/model-groups`. That is backwards ownership: a feature module should not reach into transport-layer folders for shared display/model helpers.~~ ✅ 2026-04-16 (`ff22877c`) by moving provider metadata + available-model-group shaping into onboarding-owned helper modules.

- **Low** — ~~Onboarding-state reads still do synchronous file probing on the main-process path — `apps/desktop/electron/features/onboarding/preflight.ts:23-41` and `apps/desktop/electron/features/onboarding/provider-health.ts:33-43` synchronously inspect `auth.json`, `MEMORY.md`, and `models.json` on every onboarding-state request. The files are small, so this is not urgent, but it does keep the path more blocking than it needs to be.~~ ✅ 2026-04-16 (`ff22877c`) by switching onboarding probes to async `fs/promises` reads/access checks.

- **Low** — ~~`types.ts` still carries dead helper copies after the recommendation logic moved — `apps/desktop/electron/features/onboarding/types.ts:64-84` defines unused `findModelName()` and `buildRecommendation()` helpers even though recommendation construction now lives in `apps/desktop/electron/features/onboarding/recommendations.ts:231-239`.~~ ✅ 2026-04-16 (`ff22877c`) by removing unused helper remnants from `types.ts`.

## Proposed Refactoring
1. **Separate onboarding-state evaluation from onboarding-state repair.**
   - Keep one pure-ish read path that computes current onboarding state from already-loaded settings/provider/model data.
   - Move migration/cleanup writes into an explicit repair helper (for example `repairOnboardingSettingsState()`), then call it from a clearly named startup or mutation boundary rather than implicitly from every state refresh.
   - This preserves behavior while making future regressions easier to reason about.

2. **Move model/provider presentation helpers to a neutral shared module.**
   - Extract provider display metadata and available-model-group shaping into a shared feature/helper location (for example `electron/shared/providers/**` or `electron/features/models/**`).
   - Let both onboarding and IPC import from that shared module instead of onboarding importing from IPC.
   - Aligns with the layering guidance already reinforced in earlier deslopify waves.

3. **Trim the synchronous probe surface on the hot path.**
   - Keep correctness first, but consider caching or batching tiny file reads when `getOnboardingState()` is called multiple times during a single onboarding flow.
   - If the read path stays synchronous, make that a deliberate documented trade-off instead of an incidental implementation detail.

4. **Delete leftover dead helpers in `types.ts`.**
   - Keep `types.ts` focused on shared onboarding-only helper types and `emptyOnboardingState()`.
   - Remove functions that no longer participate in recommendation assembly.

## Benefits & Trade-offs
- Benefits: cleaner ownership boundaries, fewer surprising side effects on a read path, and a simpler maintenance story for future onboarding-state changes.
- Trade-offs: moving repair logic out of `getOnboardingState()` means callers need a more explicit sequencing model; the migration path must stay behaviorally identical during the transition.

## Dependencies & Risks
- If onboarding repair is decoupled from the state getter, the team must decide exactly where repair now happens (startup, model-config mutation, auth mutation, or a dedicated onboarding repair step).
- Shared helper extraction will touch both onboarding and IPC modules; do it in one change to avoid temporary import churn.
- Any caching/batching around provider/model health must preserve up-to-date behavior immediately after auth or model-config changes.

## Next Steps
1. ~~Extract repair/migration writes out of `getOnboardingState()` into an explicitly named helper.~~ ✅ 2026-04-16 (`ff22877c`)
2. ~~Move provider display + available-model-group helpers out of IPC-owned modules.~~ ✅ 2026-04-16 (`ff22877c`)
3. ~~Remove dead helper copies from `types.ts`.~~ ✅ 2026-04-16 (`ff22877c`)
4. ~~Re-check whether synchronous file probes still matter once the state path is cleaner.~~ ✅ 2026-04-16 (`ff22877c`)
5. Verification checklist:
   - Existing profiles with legacy default-provider settings still get migrated correctly.
   - Unavailable saved model tiers are still cleaned up and surfaced as warnings.
   - Onboarding state still transitions correctly between `auth`, `ready`, and `done` after provider login/logout.
   - Provider names/model groups render identically after helper extraction.

## Execution log
- 2026-04-16 — `ff22877c` — `refactor(onboarding): split state reads from repair side effects`
