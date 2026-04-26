# Context for: Plugin Author Quick Path / app-runtime API guide

## Relevant Files
- `apps/docs-site/docs/guide/plugins-and-apps.md` — user-facing overview of plugin/app model, App Store, sidebar favorites, alpha caveats, and the high-level authoring surface.
- `apps/docs-site/docs/reference/plugins.md` — canonical public plugin overview; points to quickstart/end-to-end examples and frames built-in vs external plugins.
- `apps/docs-site/docs/reference/plugin-quickstart.md` — smallest starter path; names the Daily Quote example, core file shape, and production `base: './'` note.
- `apps/docs-site/docs/reference/plugin-end-to-end-example.md` — smallest public UI + extension + runtime example; points to Notes example structure.
- `docs/plugins/quickstart.md` — source quickstart details; package manifest examples, local dev, install flow, and what to copy.
- `docs/plugins/guide.md` — full author/user guide; manifest fields, install/distribution, local plugin development, packaging, discovery, and FAQ.
- `docs/plugins/technical.md` — host/runtime internals: install/discovery/loading, module federation, tool bridging, IPC, security, build pipeline.
- `docs/plugins/host-compatibility.md` — enforced host version/capability contract and CLI bridging migration guidance.
- `packages/app-runtime/src/index.ts` — public app-runtime exports currently available to plugin UIs.
- `packages/app-runtime/src/use-app-state.ts` — file-backed reactive state hook implementation and no-localStorage pattern.
- `packages/app-runtime/src/use-app-info.ts` — app/workspace identity hook.
- `packages/app-runtime/src/use-agent-prompt.ts` — prompt active agent session from UI.
- `packages/app-runtime/src/use-app-tools.ts` — app-agent tool bridge hook.
- `packages/app-runtime/src/use-widget-registration.ts` — runtime widget registration hook.
- `packages/common/src/plugins.ts` — shared plugin metadata/types and host capability constants.
- `plugins/sero-admin-plugin/package.json` — minimal in-repo plugin with UI + extension + app state.
- `plugins/sero-cron-plugin/package.json` — in-repo plugin with UI + extension + app state + widget metadata.
- `plugins/sero-git-plugin/package.json` — another UI + extension reference with standard manifest shape.

## Public author-doc gaps to fill after current user-facing docs
- The user-facing docs already explain the plugin/app mental model, but a conservative author guide still needs a **single, minimal “do this first” path** that ties together:
  - `package.json` manifest keys (`pi.extensions`, `sero.app`, `sero.plugin`)
  - one extension entry
  - one UI entry
  - one shared state contract
  - optional runtime/widget paths
- The current docs mention hooks, but a guide should be careful to separate **safe alpha-level APIs** from internal/less-stable ones. `useAppState`, `useAppInfo`, `useAgentPrompt`, `useAppTools`, `useTheme`, `useAvailableModels`, and widget registration are exported, but docs should avoid implying permanent stability.
- Docs should explicitly call out that plugins are **source-only OSS alpha** and should be treated as trusted code, not as a marketplace with stable auto-update guarantees.
- The guide needs sharper wording around **where state lives** and that plugin UI state should go through the app-state bridge, not browser storage.
- The guide should explain **what happens when host capabilities are missing**: install can fail, installed plugins can remain on disk but be inactive, and Discover/App Store can still show unsupported items.

## Minimal recommended plugin path
- **Package metadata**:
  - `pi.extensions` points at the extension entry.
  - `sero.app` describes app identity, icon, scope, state file, UI bundle path, component name, and optional `devPort`.
  - `sero.plugin` carries category, tags, `minSeroVersion`, `requiredHostCapabilities`, `preBuilt`, and optional `bridgeTools`.
- **Extension**: one focused `extension/index.ts` entry is the norm; examples show tools, commands, and safe state-file access.
- **UI**: one mounted React component exposed through Module Federation.
- **Shared types**: keep plugin-local durable contracts in `shared/types.ts`; only move truly neutral cross-package contracts into `packages/common/src/`.
- **Optional runtime**: use `sero.app.runtime` / runtime folder when the plugin needs long-lived background orchestration.
- **Optional widgets**: declare them in `sero.app.widgets` or register at runtime; keep promises limited to summary/compact views.

## App-runtime hooks worth documenting at alpha level
- `useAppInfo()` — returns `appId`, `workspaceId`, `workspacePath`.
- `useAppState(defaultState)` — initial read + file watching + writes through IPC; returns `[state, updateState]` and is explicitly file-backed.
- `useAgentPrompt()` — sends text to the active agent session; no session IDs exposed.
- `useAppTools()` — exposes `run(toolName, params)` and depends on `window.sero.appAgent.invokeTool`.
- `useWidgetRegistration()` — registers a widget for the current renderer session; useful to mention only if the plugin actually supports runtime widgets.
- `useAI`, `useAvailableModels`, `useTheme` exist in the public barrel, but the docs should only describe them if the guide can verify current host behavior and desired support surface.

## File-backed app state model and storage caveat
- `useAppState` uses the host bridge, not browser storage.
- State is watched from the main process and written atomically through IPC; the hook falls back safely when writes fail.
- The docs should state plainly: **do not use `localStorage` or `sessionStorage` for plugin app state**.
- Existing docs place app state files under either workspace-scoped `<workspace>/.sero/apps/<id>/state.json` or global `~/.sero-ui/apps/<id>/state.json` depending on scope/host model.
- The state file path is a manifest concern, but the exact storage path should be presented conservatively and only when verified against the current host model.

## Host capability wording
- `docs/plugins/host-compatibility.md` and `docs/plugins/guide.md` confirm the public contract names:
  - `appAgent.invokeTool`
  - `tool.cli`
  - `appRuntime.background` appears in shared constants, but the public docs currently only emphasize the first two as enforced compatibility seams.
- Wording should say a plugin **requires** a capability when listed in `requiredHostCapabilities`.
- `requiredHostCapabilities` is enforced during install/load; unsupported plugins can remain installed but inactive.
- Unknown capability strings should be treated as unmet by the host, so docs should advise using canonical names only.

## Module Federation basics and production base path
- Plugin UIs are federated remotes loaded dynamically by the host.
- `vite.config.ts` should use `base: './'` for production builds so `sero-ext://` can resolve chunk URLs correctly.
- Published plugins are expected to ship a pre-built `dist/ui/remoteEntry.js`; source installs rebuild locally unless `preBuilt: true`.
- The docs should avoid overspecifying loader internals beyond “host resolves remote entry, loads exposed component, mounts it into the app area.”

## Tool bridging and Pi extension caveats
- `sero.plugin.bridgeTools` controls whether plugin tools are bridged into `sero-cli`:
  - omitted/`true` → all tools
  - `false` → none
  - `string[]` → selected tool names
- `requiredHostCapabilities: ["tool.cli"]` is the explicit contract when relying on bridged CLI behavior.
- `docs/plugins/host-compatibility.md` says bridged CLI commands are session-correct and refreshed on reload; docs can safely say help/summary/execution stay aligned after reinstall/update.
- `technical.md` confirms plugin tools are bridged from the plugin package itself; authors should keep CLI metadata on the tool definition rather than building parallel host-side command wiring.
- Source-confirmed caveat: the host walks up from loaded extension paths to read the nearest `package.json` for bridge policy.

## Alpha API stability caveats / what not to claim
- Do **not** claim app-runtime APIs are permanently stable.
- Do **not** claim Discover is a stable commercial marketplace or that auto-update is a public guarantee.
- Do **not** claim every plugin works identically in every profile/workspace/host mode.
- Do **not** claim dashboard widget placement/sizing is fixed beyond declared hints.
- Do **not** present external plugins as bundled Sero features.
- For provider plugins, only claim `sero.providers` is host metadata; it does not register providers by itself.

## Links and sidebar placement recommendations
- Current docs already route users to:
  - `App Store, Favorites, and Installed Plugins` for end-user flow
  - `Plugins` for the canonical overview
  - `Plugin Quickstart` for the starter path
  - `Plugin End-to-End Example` for runtime-enabled reference
- Sidebar guidance should stay conservative:
  - core shell apps are always present
  - favorited discovered apps can appear in the sidebar
  - bundled plugins may be seeded as favorites and removed from the sidebar without uninstalling
  - unsupported/missing-capability plugins may remain installed but not activate
- For the author guide, recommend the Quickstart first, then the end-to-end example only when runtime/widgets are needed.

## In-repo plugin examples to reference
- `plugins/sero-admin-plugin` and `plugins/sero-git-plugin` are small, in-repo examples with standard plugin metadata, UI, extension, and app state.
- `plugins/sero-cron-plugin` is more featureful and also demonstrates widget metadata.
- `plugins/sero-notes-plugin` was not present in this checkout, so use the smallest available in-repo plugin examples above instead.
