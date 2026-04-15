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
