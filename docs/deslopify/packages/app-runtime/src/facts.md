# Facts — packages/app-runtime/src

_Last reviewed: 2026-04-13_

## What this code does
`packages/app-runtime/src` is the React-facing runtime package for federated
Sero app UIs. It provides the shared app context, typed `window.sero` access,
file-backed app state hooks, app-scoped agent/model/theme hooks, and a runtime
widget registry used by the desktop dashboard and plugin remotes.

## Shape & metrics
- Total files: 11
- Total LOC: 620
- Largest file: `packages/app-runtime/src/sero-bridge.ts` (102 LOC)
- No files over 500 LOC
- Largest files after `sero-bridge.ts`:
  - `packages/app-runtime/src/widget-registry.ts` (97)
  - `packages/app-runtime/src/use-widget-registration.ts` (80)
  - `packages/app-runtime/src/use-app-state.ts` (79)
- External dependencies of note:
  - `react` (peer dependency)
- Main consumers of note:
  - Desktop host mount code: `apps/desktop/src/components/apps/{SeroAppMount.tsx,dashboard/WidgetMount.tsx,useAppRuntimeMount.ts}`
  - Desktop dashboard runtime widget store: `apps/desktop/src/components/apps/dashboard/useRuntimeWidgets.ts`
  - Built-in plugin UIs: `plugins/sero-{admin,context,cron,git,kanban,user-feedback,web}-plugin/ui/**`
  - Plugin templates and authoring docs under `packages/templates/skills/sero-plugin/**`
- Adjacent duplication to keep in mind:
  - `packages/app-runtime/src/sero-bridge.ts:64-82` duplicates model-group
    contracts already owned by `packages/common/src/model-selection.ts:25-39`
  - `packages/app-runtime/src/sero-bridge.ts:31-59` duplicates bridge result /
    command shapes already declared in desktop preload typings
- Type escape hatches currently present:
  - `packages/app-runtime/src/context.ts:36`
  - `packages/app-runtime/src/widget-registry.ts:45`
  - `packages/app-runtime/src/sero-bridge.ts:97`
- Test surface:
  - no package-local tests; current behavior is covered only indirectly by
    desktop/widget/plugin consumers

## Architectural notes
- This package is the host↔remote UI seam for Sero plugins. It must stay
  renderer-safe and module-federation-friendly: no Electron imports, no desktop
  app type dependencies, and singleton behavior must survive duplicate module
  copies in dev.
- The `globalThis` singleton pattern in `context.ts` and `widget-registry.ts` is
  intentional for MF/dev correctness, but the current implementation achieves it
  with `any` casts instead of typed globals.
- `useAppState()` is the package’s most behavior-sensitive hook: it owns the
  read/watch/write lifecycle for file-backed plugin state and is the main place
  where host IPC failures or race conditions would surface to plugin UIs.
- `useWidgetRegistration()` is intentionally sticky across app unmount so
  dashboard widgets can keep rendering after the full app view disappears.

## Runtime-sensitive surfaces
- `getSeroApi()` and the bridge interfaces in `sero-bridge.ts` must stay aligned
  with the desktop preload surface. Type-safe-looking drift here will break
  plugin UIs at runtime because remotes compile against this package, not the
  desktop app’s declarations.
- `useAppState()` controls optimistic local state, file watching, and persistence.
  Cleanup changes here can alter plugin state consistency across multiple
  renderer consumers.
- `widget-registry.ts` and `useWidgetRegistration()` drive runtime dashboard
  widgets. Fixes must preserve the intentional “widget survives app unmount”
  behavior.
- `AppContext` singleton identity must remain stable across duplicate module
  copies in Vite/module-federation dev mode.

## Surprising discoveries
- The package is very small, but it still contains three explicit type escape
  hatches on its most important boundary seams (`globalThis` singleton access
  and `window.sero` access).
- `useWidgetRegistration()`’s docs example uses inline size objects, and the
  hook currently depends on those objects by identity, so a normal re-render can
  trigger another registry publish even when the widget definition is unchanged.
- `useAppState()` optimistically updates local React state before awaiting or
  catching `appState.write()`, so persistence failures can leave a remote UI
  ahead of disk without any package-level recovery path.
- `sero-bridge.ts` duplicates the model-group contracts that `@sero/common` is
  already supposed to own, which confirms the shared-package review order in the
  broader tasklist.
