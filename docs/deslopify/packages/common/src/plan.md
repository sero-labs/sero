# Refactoring Plan — packages/common/src

_Plan drafted: 2026-04-13_

## Executive Summary
`packages/common/src` is structurally healthy but under-owned. It is supposed to
be the canonical renderer-safe contract package for desktop, remotes, and
plugins, yet its biggest file (`model-selection.ts`) is already a near-cap
multi-role hub, and two important shared seams still live outside it: app-runtime
redefines model-group contracts, and desktop privately defines plugin-provider
manifest types. The right outcome is not a rewrite; it is a tightening pass that
keeps `@sero/common` small, canonical, and explicitly responsible for cross-
package contracts.

## Issues Found (prioritized)
- **Medium** — `model-selection.ts` is a near-cap shared chokepoint —
  `packages/common/src/model-selection.ts:1-396` now carries constants,
  domain types, lookup helpers, heuristics, and warning generation for every
  desktop/plugin consumer. It is the largest file in the package and already
  has enough fan-out that one more concern will push shared contract work into a
  hard-to-review hub. Effort: **M**.

- **Medium** — Shared warning contracts are coupled to UI copy —
  `packages/common/src/model-selection.ts:56-68` defines
  `ModelValidationWarning` with a required `message`, and the warning builders at
  `packages/common/src/model-selection.ts:291-396` hardcode end-user English
  strings. That makes a supposedly neutral contract package responsible for
  presentation copy instead of just shared semantics. Effort: **M**.

- **Medium** — `@sero/common` only partially owns the plugin package schema —
  `packages/common/src/plugins.ts:18-79` covers `sero.plugin` and discovery /
  install shapes, but `sero.providers` metadata is still redefined in
  `apps/desktop/electron/shared/providers/package-provider-manifests.ts:18-38`.
  That leaves plugin package typing split across the shared package and a
  desktop-only implementation file, despite the plugin docs treating both as
  first-class manifest contract. Effort: **M**.

- **Medium** — Adjacent shared packages still duplicate contracts that belong
  here — `packages/common/src/model-selection.ts:25-47` already defines the
  neutral model-group shapes, but `packages/app-runtime/src/sero-bridge.ts:64-82`
  redefines `AppModelInfo` / `AppModelGroup`. That undermines the package’s
  reason to exist and guarantees drift if one side evolves first. Effort: **M**.

- **Low** — There is no direct focused test surface for the pure shared logic —
  `packages/common/` contains only source + typecheck files, while high-fan-out
  helpers such as `inferSupportsXhigh()`, `getAvailableThinkingLevels()`, and
  the validation builders are covered only indirectly from downstream packages.
  Effort: **S**.

## Proposed Refactoring
1. **Split `model-selection.ts` by responsibility while keeping the public API stable.**
   - Target shape:
     - `packages/common/src/model-selection/types.ts`
     - `packages/common/src/model-selection/lookup.ts`
     - `packages/common/src/model-selection/validation.ts`
     - `packages/common/src/model-selection/index.ts`
   - Keep `packages/common/src/index.ts` as the only public barrel.
   - Why: this preserves existing imports while preventing the package’s most
     reused shared file from becoming another near-cap contract blob.

2. **Make model-validation results data-first instead of copy-first.**
   - Replace the current “code + full message string” contract with a typed issue
     shape that carries only shared semantics (`code`, `severity`, `tier`,
     `provider`, `modelId`, `preferredLabel`, `maxSupported`, etc.).
   - Add a formatter helper for current desktop/admin copy so consumer UIs can
     keep rendering the same text while the shared package stops owning wording.
   - Why: aligns `@sero/common` with its role as a neutral contract layer rather
     than a presentation layer.

3. **Promote provider-manifest typing into `@sero/common`.**
   - Add shared types for `sero.providers` metadata alongside `PluginMeta`.
   - Update `apps/desktop/electron/shared/providers/package-provider-manifests.ts`
     to consume those shared types instead of defining its own desktop-local
     manifest interfaces.
   - Keep normalization / disk-scanning logic in desktop; move only the neutral
     package-contract types.
   - Why: this is the same canonical-type rule already applied to `PluginMeta`
     and `InstalledPlugin`, and it matches the plugin docs.

4. **Use the follow-up `packages/app-runtime/src` pass to delete duplicate model types.**
   - Replace `AppModelInfo` / `AppModelGroup` in
     `packages/app-runtime/src/sero-bridge.ts` with imports from `@sero/common`
     (`SharedModelInfo`, `SharedAvailableModelGroup`) or thin aliases of them.
   - Keep app-runtime-specific bridge interfaces (`SeroModelsBridge`, etc.) in
     app-runtime; move only the neutral contracts.
   - Why: shared contracts should fail together at typecheck time instead of
     drifting silently across packages.

5. **Add focused tests before changing heuristics or warning payloads.**
   - Add a small test surface for:
     - `inferSupportsXhigh()`
     - `getAvailableThinkingLevels()`
     - `resolveSupportedThinkingLevel()`
     - validation issue generation for missing models / tiers / fallback-only
   - If adding a dedicated package test runner is too much churn, place the
     tests in the closest existing workspace test suite that already exercises
     shared model config behavior.

## Benefits & Trade-offs
- Benefits: makes `@sero/common` a clearer source of truth, reduces shared-type
  drift across app-runtime and desktop, keeps the biggest file from tipping over
  the 500-LOC rule later, and lowers the cost of future plugin/package reviews.
- Trade-offs: shared contract moves will touch multiple consumers at once, and
  converting warning payloads away from copy-bearing objects will create a short
  burst of downstream UI churn.

## Dependencies & Risks
- The provider-manifest cleanup depends on keeping desktop-only scanning and file
  IO in `apps/desktop/`; only the pure contract should move.
- The app-runtime dedupe depends on the next Wave A review for
  `packages/app-runtime/src`, because changing shared model shapes in isolation
  would just move the drift to that package.
- Warning-contract cleanup is behavior-sensitive at the UI layer: the rendered
  copy should stay functionally equivalent in onboarding/admin flows even if the
  shared package stops storing preformatted sentences.
- Any change to `ExtensionSessionRuntime` or plugin manifest typing needs to
  stay aligned with AD-020 and `docs/plugins/technical.md` so the tool bridge
  and manifest-driven discovery do not drift.

## Next Steps
1. `deslopify packages/app-runtime/src` and explicitly compare its bridge types
   against `@sero/common` ownership.
2. In the shared-package High/Medium synthesis, group:
   - shared model-contract dedupe (`common` + `app-runtime`)
   - plugin manifest contract completion (`common` + desktop provider manifests)
3. When execution starts, split `model-selection.ts` first before moving any new
   shared contracts into the package.
4. Add focused coverage for model-selection heuristics before changing warning
   payloads or provider-manifest types.

Verification checklist for the future fix pass:
- Desktop onboarding and admin model selectors still show the same warnings and
  supported thinking-level options.
- `apps/desktop/electron/features/apps/discovery` and
  `electron/shared/providers/package-provider-manifests.ts` still parse the same
  plugin package metadata.
- `packages/app-runtime` and `@sero/common` agree on model-group shapes after
  the dedupe.
- Monorepo `pnpm typecheck` stays green across desktop, `@sero/common`,
  `@sero-ai/app-runtime`, and the plugin packages that consume these contracts.

## Execution log
- `e09e6fad` — `fix(kanban): centralize shared contract and remove dead settings` (added `packages/common/src/kanban.ts` as the canonical Kanban contract home while leaving this folder's direct Medium items pending)
