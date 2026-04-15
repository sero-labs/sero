# Facts — apps/desktop/src/lib

_Last reviewed: 2026-04-15_

## What this code does
`src/lib` contains renderer utility and integration modules for shell startup, layout persistence, module federation remote loading, app-control bridge/DOM interaction helpers, theme engine + font loading, app icon lookup, and lightweight helpers (copy-to-clipboard, app navigation).

## Shape & metrics
- Total files: 15
- Total LOC: 1,788
- Largest file: `apps/desktop/src/lib/app-control/dom-interactions.ts` (385 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - `@module-federation/enhanced/runtime` for remote registration/loading
  - React `lazy()` for federated component wrappers
  - DOM/browser APIs for app-control automation and theme/font application
  - Cross-store access (`useAppStore`, `useWorkspaceStore`, `useThemeStore`, etc.) from persistence/bridge utilities
- Upstream callers:
  - `@/lib/*` modules are imported by ~26 files in renderer codepaths (stores, shell components, theme editor, app surfaces).
- Downstream dependencies:
  - `persist-layout.ts` is a central persistence chokepoint for multiple stores.
  - `federation-registry.ts` is the sole runtime remote loader path for discovered plugin apps.

## Architectural notes
- This folder sits on boundary-heavy renderer infrastructure: module federation, DOM interaction simulation, and shell persistence.
- `federation-registry.ts` controls dynamic remote lifecycle and transient fallback behavior, so cache semantics here directly impact app availability.
- `app-control/dom-interactions.ts` is intentionally renderer-only imperative code and should remain isolated from store/domain logic.

## Surprising discoveries
- `getFederatedComponent()` caches lazy wrappers before load completion; when loading fails, the cached wrapper resolves to a permanent null component unless external invalidation happens.
- `app-control/dom-interactions.ts` has grown into a dense multi-mode interaction engine (click/type/scroll/select/hover/get-text/inspect) but remains in one file at 385 LOC.
- `theme-engine.ts` ends with an unexported `presetToMeta()` helper that is currently dead code.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 18 (was 15)
- Total LOC: 1,954 (was 1,788)
- Largest file: `apps/desktop/src/lib/app-control/dom-interactions.ts` (385 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): none
- Type escape hatches remaining: none introduced in this pass

### What changed
- Added explicit per-cache-key cleanup in `federation-registry.ts` so failed lazy remote loads clear stale lazy wrappers, resolved-module entries, and LRU bookkeeping before returning the null fallback.
- Added jsdom regression coverage that a transient lazy remote failure retries and recovers on the next access without requiring `refreshTransientRemote()` or an app restart.
- Preserved the existing transient dev-server fallback behavior and kept the folder’s remaining work scoped to the DOM/font/theme follow-ups.

### Still outstanding
- `app-control/dom-interactions.ts` is still a 385-LOC multi-responsibility router and remains the next Medium cleanup target.
- `google-fonts.ts` still preloads every mapped Google font eagerly.
- `theme-engine.ts` still carries the dead `presetToMeta()` helper.

## Post-fix snapshot — 2026-04-15 (dom-interactions split)

### Metrics after fixes
- Total files: 21 (was 18)
- Total LOC: 2,228 (was 1,954)
- Largest file: `apps/desktop/src/lib/federation-registry.ts` (313 LOC; was `app-control/dom-interactions.ts` at 385 LOC)
- Files over 500 LOC: none (unchanged)
- Near-cap files (≥400 LOC): none
- Type escape hatches remaining: none introduced in this pass

### What changed
- Reduced `app-control/dom-interactions.ts` from a 385-LOC multi-owner engine to a 42-LOC router that preserves the exported `executeAppInteraction` + `getAppPanelRect` API.
- Added focused interaction modules under `app-control/dom/`:
  - `geometry.ts` — app-panel lookup and rect math
  - `targeting.ts` — selector lookup, click-target resolution, and point stack capture
  - `actions.ts` — click/type/scroll/select/hover/get-text handlers
  - `inspect.ts` — inspect payload shaping and interactive element summaries
- Kept the existing `dom-interactions.test.ts` coverage green to validate point-inspection and coordinate click semantics through the extracted module seams.

### Still outstanding
- `google-fonts.ts` still preloads every mapped Google font eagerly.
- `theme-engine.ts` still carries the dead `presetToMeta()` helper.

## Post-fix snapshot — 2026-04-15 (google-font preload strategy)

### Metrics after fixes
- Total files: 22 (was 21)
- Total LOC: 2,314 (was 2,228)
- Largest file: `apps/desktop/src/lib/federation-registry.ts` (313 LOC; unchanged)
- Files over 500 LOC: none (unchanged)
- Near-cap files (≥400 LOC): none
- Type escape hatches remaining: none introduced in this pass

### What changed
- Updated `preloadAllGoogleFonts()` to preload only a curated popular subset (`Inter`, `Geist`, `Roboto`, `Open Sans`, `JetBrains Mono`, `Fira Code`, `Source Code Pro`, `IBM Plex Sans`, `IBM Plex Mono`) instead of eagerly loading every mapped family.
- Preserved on-demand loading for less-common families through `loadGoogleFont()` so picker choices still resolve as users select them.
- Added direct `google-fonts.test.ts` coverage for curated preload scope, dedupe behavior, on-demand loading, and no-op handling for non-mapped/system font stacks.

### Still outstanding
- `theme-engine.ts` still carries the dead `presetToMeta()` helper.
