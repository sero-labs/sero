# Facts — packages/common/src

_Last reviewed: 2026-04-13_

## What this code does
`packages/common/src` is the renderer-safe contract package shared across the
Sero desktop host, shared UI package, and built-in plugins. Today it owns three
main seams: plugin/discovery manifest types, execution-scoped session-runtime
bridge types for AD-020 CLI tool bridging, and model-selection contracts/helpers
used by onboarding, model configuration UIs, and agent model availability flows.

## Shape & metrics
- Total files: 4
- Total LOC: 590
- Largest file: `packages/common/src/model-selection.ts` (396 LOC)
- Files over 500 LOC: none
- Near-cap files (≥390 LOC):
  - `packages/common/src/model-selection.ts` (396)
- External dependencies of note:
  - `@mariozechner/pi-agent-core` — `ThinkingLevel` type only
- Upstream callers / consumers of note:
  - `apps/desktop/src/components/layout/model-config.ts`
  - `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`
  - `apps/desktop/electron/shared/settings/model-config.ts`
  - `apps/desktop/electron/features/apps/discovery/index.ts`
  - `apps/desktop/electron/features/plugins/discovery.ts`
  - `packages/ui/src/components/model-selection/*`
  - `plugins/sero-admin-plugin/ui/components/{AgentEditor,ModelPanel}.tsx`
  - `plugins/sero-kanban-plugin/extension/session-runtime.ts`
- Adjacent duplication to keep in mind:
  - `packages/app-runtime/src/sero-bridge.ts:64-82` duplicates model-group
    contracts already owned here
  - `apps/desktop/electron/shared/providers/package-provider-manifests.ts:18-38`
    defines plugin-provider manifest types outside the canonical shared package
- Test surface:
  - no package-local tests; behavior is covered only indirectly from desktop and
    plugin consumers

## Architectural notes
- This package is the intended home for neutral cross-package contracts per the
  monorepo guidance. When a type is shared across desktop, remotes, and plugins,
  future reviews should prefer moving it here instead of duplicating it in
  `shared/` folders or desktop-only modules.
- `model-selection.ts` is currently doing three jobs at once: domain types,
  lookup/normalization helpers, and warning-generation logic with user-facing
  copy.
- `plugins.ts` is already the canonical home for `sero.plugin` / discovery
  contracts, but it does not yet cover the newer `sero.providers` metadata that
  `docs/plugins/{guide,technical}.md` treat as part of the plugin package
  contract.
- `session-runtime.ts` is intentionally narrow: it models only the
  execution-scoped `sessionRuntime` capability forwarded through the AD-020 CLI
  bridge, not the full Pi extension API.

## Runtime-sensitive surfaces
- `inferSupportsXhigh()`, `getAvailableThinkingLevels()`, and
  `resolveSupportedThinkingLevel()` influence onboarding recommendations,
  renderer model selectors, and desktop-side model state shaping. “Pure” changes
  here can still alter real runtime defaults and UI affordances.
- `PluginMeta`, `InstalledPlugin`, and `DiscoveredPlugin` flow into plugin
  discovery, installation, and settings-backed management. Contract drift here
  can break discovery UI or host/plugin compatibility without touching Electron
  IPC code.
- `ExtensionSessionRuntime` types must stay aligned with the AD-020 tool-bridge
  contract implemented in `apps/desktop/electron/cli/**`.

## Surprising discoveries
- `packages/common/src` is small overall, but nearly two-thirds of the package
  lives in one file (`model-selection.ts`), so most future shared-contract work
  will pile onto a single module unless it is split soon.
- The package already owns plugin manifest contracts, yet provider manifest
  typing still lives in a desktop-only file, which means the plugin package
  schema is only partially canonical today.
- `packages/app-runtime` redefines model-group interfaces instead of importing
  `SharedModelInfo` / `SharedAvailableModelGroup`, which is exactly the kind of
  shared-contract drift this package is supposed to prevent.
- There are no High-rule violations in this package right now: no 500+ LOC
  files, no storage-policy drift, and no type escape hatches in the shared code
  itself.
