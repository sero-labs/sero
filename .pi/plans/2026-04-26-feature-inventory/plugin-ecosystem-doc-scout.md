# Context for: plugin ecosystem docs-site guide(s)

## Relevant Files
- `docs/plugins/guide.md` — canonical source doc. Covers what a plugin is, install sources, uninstall behavior, creation, local dev, manifest reference, distribution, discovery, and FAQ.
- `apps/docs-site/docs/reference/plugins.md` — short user-facing overview. Emphasizes built-in vs external plugins, alpha/trust caveats, and points to quickstart / end-to-end example.
- `apps/docs-site/docs/reference/plugin-quickstart.md` — author starter path. Frames Daily Quote as the structurally minimal example and points to the key files to copy.
- `apps/docs-site/docs/reference/plugin-end-to-end-example.md` — author reference for UI + extension + runtime + dashboard widget metadata.
- `packages/app-runtime/README.md` and `packages/app-runtime/src/*.ts` — author-facing runtime API surface for federated app modules.
- `apps/desktop/src/stores/app/shared.ts` / `state.ts` / `discovery.ts` / `MainSidebar.tsx` / `AppStoreDialog.tsx` / `federation-registry.ts` — current product behavior for discovery, favorites, loading, and MF remote handling.
- `apps/desktop/src/stores/dashboard.ts` — verifies widget support at runtime and how static manifest widgets and runtime-registered widgets combine.

## Key Findings
- **Built-in vs plugin distinction**: built-ins live in the monorepo (`plugins/sero-*-plugin/`) and are not removable; plugins are external app packages installed under `~/.sero-ui/agent/plugins/<id>/`. The docs-site overview should say this plainly.
- **User-facing app model**:
  - sidebar shows built-ins plus favourited discovered apps; discovered apps are not all shown by default.
  - App Store dialog has two tabs: **Installed** and **Discover**.
  - Installed search filters app manifests locally; Discover searches public/community plugins via `window.sero.plugins.search()`.
  - install/uninstall from App Store is wired and updates the current list immediately.
- **Favorites/sidebar behavior**: `getSidebarApps()` returns built-ins plus favorited discovered apps that are host-supported. Built-ins cannot be favourited/unfavourited. Sidebar launch is `openApp(app.id)`.
- **Host compatibility gating**: unsupported plugin apps are filtered out of sidebar priority/preload and ignored on activation. `minSeroVersion` and `requiredHostCapabilities` are enforced during install/load; unsupported apps can remain installed but not activate.
- **Remote/module federation behavior**: desktop dynamically registers remotes at runtime because MF static scanning is insufficient for dynamic app loading. `federation-registry.ts` resolves remote entries, supports `remoteEntryOverride`, dev-port fallback in development, `sero-ext://<appId>/mf-manifest.json` as the installed-plugin path, and caches/evicts loaded modules with LRU.
- **App-runtime hooks exposed**:
  - `useAppState` = file-backed reactive state via `window.sero.appState`.
  - `useAppInfo` = app/workspace identity only.
  - `useAgentPrompt` = send text to active agent session.
  - `useAI` = prompt / promptStream against the app’s dedicated agent session.
  - `useAppTools` = invoke bridged tools via `window.sero.appAgent.invokeTool`.
  - `useAvailableModels` = fetch model groups if the host exposes models bridge.
  - `useTheme` = read effective mode/preset.
  - `useWidgetRegistration` / `registerWidget` = runtime widget registration for the current renderer session.
- **Widget support is real**: dashboard resolves available widgets from both static manifest `widgets` and runtime widget registration. Runtime widgets are accepted and persist as a source on the dashboard store. This is enough to mention widgets in author docs, but keep the wording scoped to dashboard widgets only.
- **Runtime caveats**: `packages/app-runtime` is decoupled from desktop types, uses `window.sero` IPC, and expects to run inside the Sero shell. Hooks throw or degrade when unavailable.
- **Alpha/trust caveats**: docs already warn that third-party plugins should be trusted-source only during alpha and that contracts may evolve. Keep this visible in docs-site content.

## Recommended Docs Shape
- Prefer **two docs paths**:
  1. **User guide / overview** for installers and end users: built-ins vs plugins, App Store, favorites/sidebar, discovery, trust caveats, and high-level compatibility behavior.
  2. **Author quick path** for plugin authors: starter shape, manifest files, app-runtime hooks, remote/module federation basics, and widget registration.
- If keeping one page, split it into clearly labeled sections: **Using Plugins** and **Building Plugins**. Do not bury author API details inside the user-facing flow.

## What Not to Document Yet
- Avoid promising precise **auto-update** semantics; source docs explicitly say auto-update is not yet supported.
- Avoid overexplaining **install/update/uninstall** edge cases beyond what is verified. Keep update semantics to “reinstall from same source replaces same app id” and “app state is preserved on uninstall.”
- Avoid documenting deeper **provider/model metadata** or **CLI bridge** behavior unless the guide needs it; these are supported but secondary to the plugin ecosystem overview.
- Avoid broad claims about non-container capabilities; the source guide notes some platform capabilities are container-only.
