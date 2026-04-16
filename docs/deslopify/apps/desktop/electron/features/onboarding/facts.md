# Facts — apps/desktop/electron/features/onboarding

_Last reviewed: 2026-04-16_

## What this code does
This feature computes main-process onboarding state for the active profile. It inspects auth/config files, queries available models from shared infra, derives provider-health status, preserves or repairs saved tier selections, and returns the recommendation/warning payload that drives the renderer onboarding wizard.

## Shape & metrics
- Total files: 5
- Largest file: `apps/desktop/electron/features/onboarding/recommendations.ts` (270 LOC)
- Files over 500 LOC: none
- External dependencies of note: shared infra/model registry, shared settings helpers + model-config helpers, provider catalog, `@/types/ipc`, active profile registry, local `models.json`
- Upstream callers: `apps/desktop/electron/ipc/onboarding/onboarding.ts`, `apps/desktop/electron/ipc/workspace/profiles.ts`, `apps/desktop/electron/__tests__/features/onboarding/recommendations.test.ts`
- Downstream dependencies: onboarding renderer state, global model-config persistence, provider reconnection UX, active-profile readiness decisions

## Architectural notes
- `getOnboardingState()` is not a pure read; it currently applies legacy-provider migration and unavailable-model cleanup while answering a status request.
- `provider-health.ts` crosses layering boundaries by importing provider metadata and model-group shaping helpers from IPC modules instead of a neutral shared/feature module.
- Recommendation logic is preservation-first: keep valid existing tiers, otherwise infer a preferred provider from healthy coverage or the legacy default provider.
- The feature treats provider health as a heuristic synthesis of stored credentials plus model availability, not a live remote verification step.

## Runtime-sensitive surfaces
- `getOnboardingState()` decides whether the renderer shows `ready`, `auth`, or `done`; any logic change here changes first-run behavior immediately.
- The preflight path can write `settings.json` while the UI is merely refreshing onboarding state, so cleanup ordering and parse-failure behavior matter.
- Provider-health inference depends on both auth storage and local model config; changing those heuristics can move providers between `healthy`, `env`, `local`, `broken_*`, and `missing` states.

## Surprising discoveries
- A “getter” path in `preflight.ts` already performs migration/cleanup writes before returning state.
- `types.ts` still contains dead helper copies (`findModelName`, `buildRecommendation`) even though recommendation construction now lives in `recommendations.ts`.
- The feature’s provider/model presentation helpers currently live under IPC internals, so onboarding is coupled to transport-layer code for basic display shaping.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 7 (was 5)
- Largest file: `apps/desktop/electron/features/onboarding/recommendations.ts` (270 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none

### What changed
- Split onboarding preflight into explicit read-only vs repair-aware entry points: `getOnboardingState()` is now read-only, while `getOnboardingStateWithRepairs()` and `repairOnboardingSettingsState()` own migration/cleanup side effects.
- Moved onboarding provider/model presentation shaping into feature-owned helpers (`provider-metadata.ts`, `model-groups.ts`) so `provider-health.ts` no longer imports IPC internals.
- Replaced synchronous onboarding file probes (`auth.json`, `MEMORY.md`, `models.json`) with async `fs/promises` reads/access checks.
- Removed dead onboarding helper leftovers from `types.ts` and added focused onboarding preflight + model-group parity coverage.

### Still outstanding
- None in this folder; the tracked Medium/Low plan items are fully executed.
