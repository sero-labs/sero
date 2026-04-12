# Refactoring Plan — apps/desktop/src/lib

_Plan drafted: 2026-04-12_

## Executive Summary
`src/lib` is mostly disciplined, but it contains one high-impact reliability bug in federated remote loading and a growing concentration of imperative DOM automation logic. The key outcome is to make app remote loading retry-safe and split dense interaction/runtime modules before they become fragile infrastructure bottlenecks.

## Issues Found (prioritized)
- **High** — Federated component load failures can become sticky null renders with no automatic retry — `apps/desktop/src/lib/federation-registry.ts:297-309` returns `{ default: () => null }` on failed remote load while keeping the `LazyComp` cached (`cache.set(cacheKey, LazyComp)`). Subsequent renders reuse the same failed wrapper, so transient outages can leave an app blank until manual invalidation/restart. Effort: **S**.

- **Medium** — DOM interaction engine is a near-cap multi-responsibility module — `apps/desktop/src/lib/app-control/dom-interactions.ts:1-385` combines selector/point targeting, synthetic pointer+mouse dispatch, inspect payload building, and action routing in one file. This increases regression risk for app-control tooling changes. Effort: **M**.

- **Medium** — Font preloader eagerly injects all Google font links with no prioritization — `apps/desktop/src/lib/google-fonts.ts:84-92` appends stylesheet links for every mapped family on preload. This front-loads network overhead even if most fonts are never used. Effort: **S**.

- **Low** — Dead code in theme engine (`presetToMeta`) adds noise — `apps/desktop/src/lib/theme-engine.ts:289-297` defines an unexported helper with no callers. Effort: **S**.

## Proposed Refactoring
1. **Make federation load failures retryable.**
   - On `loadRemoteModule` failure in `getFederatedComponent`, delete `cacheKey` from `cache`/`resolvedModules` before returning fallback.
   - Optionally return a lightweight error component with retry affordance instead of permanent null.
   - Keep existing `refreshTransientRemote()` behavior for explicit invalidation, but don’t require it for transient recovery.

2. **Split `dom-interactions.ts` by concern.**
   - Target structure:
     - `app-control/dom/geometry.ts` (rect math + panel lookup)
     - `app-control/dom/targeting.ts` (selector/point resolution)
     - `app-control/dom/actions.ts` (click/type/scroll/select/hover/get-text)
     - `app-control/dom/inspect.ts` (inspection payload building)
     - thin `dom-interactions.ts` router.
   - Preserve exported API: `executeAppInteraction`, `getAppPanelRect`.

3. **Introduce lazy font-preload strategy.**
   - Change `preloadAllGoogleFonts()` to preload only curated “popular” fonts up front, then load others on demand via `loadGoogleFont`.
   - Keep `loadedFonts` dedupe behavior.

4. **Remove or wire dead theme helper.**
   - Delete `presetToMeta()` if unused, or export+use it in theme store serialization paths.

## Benefits & Trade-offs
- Benefits: remote apps recover from transient failures without restart, app-control internals become easier to reason about/test, and theme editor startup network load drops.
- Trade-offs: splitting DOM utilities introduces additional files and requires careful regression testing for interaction semantics.

## Dependencies & Risks
- Federation retry changes affect plugin/app loading behavior; verify both dev (`localhost`) and packaged (`sero-ext://`) scenarios.
- App-control module split may require test updates (`dom-interactions.test.ts`) if internals move.
- Font preload tuning should be validated against UX expectations in the theme editor (avoid flashing unavailable fonts).

## Next Steps
1. Land High fix in `federation-registry.ts` (drop failed lazy cache entries and retry on next access).
2. Add regression tests for transient remote failure → later recovery without restart.
3. Split `dom-interactions.ts` into focused modules while preserving API.
4. Optimize `preloadAllGoogleFonts()` strategy.
5. Remove dead `presetToMeta` helper or connect it to an actual call site.
