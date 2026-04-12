# Facts — apps/desktop/src/lib

_Last reviewed: 2026-04-12_

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
