# Refactoring Plan — apps/desktop/electron/shared

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/shared` is foundational and mostly under control (no file-size or obvious type-escape violations), but it has two correctness risks that should be scheduled early: settings parse failures can cascade into destructive rewrites, and the cached default model in shared infra can drift after auth changes. The plan focuses on hardening those contracts first, then reducing coupling/drift in shared helper surfaces.

## Issues Found (prioritized)
- **High** — Silent settings parse fallback can clobber `settings.json` on subsequent writes — `apps/desktop/electron/shared/settings/settings-helpers.ts:15-20` returns `{}` on any parse/read failure, and callers later persist derived state (`apps/desktop/electron/ipc/workspace/profiles.ts:168-169`, `apps/desktop/electron/features/onboarding/preflight.ts:101-116`). A malformed settings file can be unintentionally overwritten with a partial object. Effort: **S**.

- **Medium** — Shared default model cache can become stale after auth changes — `_model` is initialized once (`apps/desktop/electron/shared/infra/shared-infra.ts:119,196`), but auth mutations only call `modelRegistry.refresh()` (`apps/desktop/electron/ipc/platform/auth/auth.ts:116`). Consumers that rely on `infra.model` (`apps/desktop/electron/ipc/agent/handlers/app-agent.ts:152`) may use outdated defaults. Effort: **S**.

- **Medium** — `shared-infra.ts` is a cross-domain singleton hub with import-time side effects — it mixes profile migration side effects (`apps/desktop/electron/shared/infra/shared-infra.ts:42`) and many service singletons (`shared-infra.ts:50-112`) across gateway, VCS, workspace, subagent, and LSP concerns. This increases review/load-bearing blast radius for unrelated changes. Effort: **M**.

- **Low** — Provider manifest scanning does repeated sync filesystem traversal with tiny TTL and includes dead helper surface — sync scans/parses run in `apps/desktop/electron/shared/providers/package-provider-manifests.ts:113-179` with `CACHE_TTL_MS = 250` (`:11`), and `getPackageProviderManifests()` is unused (`:185`). Effort: **S**.

- **Low** — User-feedback bus singleton key is duplicated across host/plugin modules — `apps/desktop/electron/shared/lib/user-feedback-bus.ts:13` and `plugins/sero-user-feedback-plugin/shared/emitter.ts:11` must stay manually aligned. Effort: **S**.

## Proposed Refactoring
1. **Harden shared settings read/write as an explicit boundary contract.**
   - Replace “return `{}` on failure” with a result-shaped API (`{ ok: true; value } | { ok: false; error }`) in `settings-helpers`.
   - Update mutating callers (`profiles` model-config set path, onboarding preflight) to abort on parse failure and return actionable UI errors instead of rewriting corrupted settings.
   - Aligns with current settings safety goals already identified in plugin manager deslop plans.

2. **Introduce a shared model refresh hook in infra.**
   - Add a small `refreshInfraModelSelection()` in `shared-infra` that re-runs `pickFirstAvailableModel` after auth/settings changes.
   - Invoke it from auth mutation paths after `modelRegistry.refresh()`.
   - Keep `ensureInfra()` lazy behavior unchanged while removing stale-model drift.

3. **Modularize `shared-infra` by registrar responsibility.**
   - Extract focused registrars (e.g., `registerGatewayInfra`, `registerVcsInfra`, `registerAgentOrchestrationInfra`) and keep `shared-infra.ts` as the composition root.
   - Preserve existing exported singleton API to avoid breaking IPC/CLI modules.
   - This keeps AD-018/AD-021 infra wiring explicit without further central-file sprawl.

4. **Refine provider manifest caching + dead code cleanup.**
   - Remove the unused private `getPackageProviderManifests` function.
   - Move from short-interval TTL polling to invalidation triggers tied to known mutation points (plugin install/uninstall, settings writes), while keeping one fallback TTL for safety.

5. **Deduplicate user-feedback bus contract.**
   - Extract the emitter key + singleton factory into one shared module consumed by both Electron and plugin bridge code.
   - Remove mirrored-copy comments once both sides import one source.

## Benefits & Trade-offs
- Benefits: safer settings persistence, fewer stale model-selection bugs, lower coupling in a foundational module, and clearer shared contract ownership.
- Trade-offs: moderate cross-module touch points (IPC auth + onboarding + profiles) and some temporary churn in singleton wiring imports.

## Dependencies & Risks
- Settings-contract changes require coordinated updates in all write paths; partial migration can introduce inconsistent error behavior.
- Infra modularization must preserve singleton initialization ordering (gateway/subagent/container dependencies) to avoid startup regressions.
- Cache invalidation strategy for provider manifests needs clear mutation hooks from plugin manager and settings writes.

## Next Steps
1. Land High fix first: make settings parse failures non-destructive.
2. Add infra model-refresh path and wire auth mutation handlers to it.
3. Split `shared-infra.ts` into registrars while preserving exported singleton API.
4. Remove dead manifest helper and switch to mutation-driven cache invalidation.
5. Queue follow-up deslopify/fix work in `apps/desktop/electron/platform` and then renderer orchestration (`src/stores`, `src/hooks`, `src/lib`).
