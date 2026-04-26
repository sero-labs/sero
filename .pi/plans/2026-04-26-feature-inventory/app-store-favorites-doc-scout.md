# Context for: App Store, favorites, and installed plugins user guide

## Relevant Files
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — explicitly marks the App Store/favorites user guide as pending and calls out the screenshot/runtime-check scope.
- `apps/docs-site/docs/guide/plugins-and-apps.md` — current public-facing overview; sets the conservative alpha framing and the built-in vs installed plugin distinction.
- `apps/docs-site/docs/reference/plugins.md` — canonical public reference for plugin types, distribution modes, alpha guidance, and source-trust caveats.
- `apps/docs-site/docs/reference/security-privacy.md` — supports the security/trust caveats and profile-state sensitivity language.
- `docs/reference/state-and-folders.md` — current storage locations for installed plugins, app state, layout/favourites, and other profile data.
- `docs/plugins/guide.md` — user-facing install/uninstall/state-retention behavior and plugin packaging conventions.
- `docs/plugins/technical.md` — confirms install/discovery/compatibility behavior and what the host does after install/uninstall.
- `apps/desktop/src/components/layout/shell/MainSidebar.tsx` — sidebar shows built-ins plus favorited discovered apps and opens the App Store dialog.
- `apps/desktop/src/components/layout/AppStoreDialog.tsx` — App Store UI with Installed/Discover tabs, search, install/uninstall, and favourite toggles.
- `apps/desktop/src/components/layout/AppStoreCard.tsx` — installed-app card UI; shows active/favourite state and unsupported-host messaging.
- `apps/desktop/src/components/layout/DiscoverPluginCard.tsx` — discover-tab card UI; shows install/uninstall affordances and source badges.
- `apps/desktop/src/stores/app/shared.ts` — defines built-in apps, default favourites, sidebar composition, and host-compatibility filtering.
- `apps/desktop/src/stores/app/state.ts` — favourites persistence, built-in exclusion, active-app handling, and reload behavior.
- `apps/desktop/src/stores/app/discovery.ts` — merges discovered apps with built-ins, prunes invalid favourites, and preloads active/favourite apps.
- `apps/desktop/src/stores/app/listeners.ts` — reacts to app/plugin change events.
- `apps/desktop/src/lib/persist-layout.ts` — writes favourite apps and other layout state to disk.
- `apps/desktop/electron/ipc/workspace/layout.ts` — layout JSON validation/sanitization for `favouriteApps`.
- `apps/desktop/electron/preload/integrations/plugins.ts` — renderer API for install/uninstall/list/search and plugin-change events.
- `apps/desktop/electron/ipc/integrations/plugins.ts` — main-process plugin IPC handlers.
- `apps/desktop/electron/features/plugins/manager.ts` — install/uninstall/list lifecycle, plugin storage path, and state-retention behavior.
- `plugins/sero-admin-plugin/package.json` / `plugins/sero-git-plugin/package.json` — concrete built-in plugin metadata examples.

## Project Structure
- The docs site already has a conservative high-level “Plugins and Apps” guide; the new guide should likely be a narrower user guide focused on App Store usage, favourites, installed plugins, and trust/support boundaries.
- On the desktop side, the App Store is not a separate app module under `components/apps`; it lives in `components/layout/` as `AppStoreDialog`, `AppStoreCard`, and `DiscoverPluginCard`.
- Sidebar app visibility is derived from the central app store, which combines two built-ins (`dashboard`, `explorer`) with discovered plugin apps.
- Favorited discovered apps are what get promoted into the main sidebar; built-ins are always present and cannot be favourited/unfavourited through the same mechanism.

## Conventions
- Docs use conservative alpha language: “source-only OSS alpha,” “trusted source code,” “do not assume,” and “not a stable marketplace.”
- User-facing docs prefer simple distinction between built-in apps and external plugins, and avoid overstating permanence or support.
- The codebase uses `favouriteApps` spelling in stores/layout persistence, even though docs prose may use “favorites” or “favourites.”
- Sidebar ordering is stable and simple: built-ins first, then favourited discovered apps.
- Search behavior is broad but local/remote separated:
  - Installed search filters local app metadata.
  - Discover search queries remote plugin sources via `window.sero.plugins.search()`.
- The App Store dialog is currently a two-tab surface (`Installed`, `Discover`), with no visible update workflow in the source inspected.

## Dependencies
- `window.sero.plugins.install(source)` / `uninstall(pluginId)` / `search(query)` / `onChanged(...)` are the current plugin management bridge.
- Plugin install/uninstall triggers main-process reconciliation and active session resource reloads; this is important for docs describing what users should expect after changes.
- Layout state persists through `window.sero.layout.save(...)` into `<SERO_HOME>/agent/layout.json`.
- Installed plugin packages live under `<SERO_HOME>/agent/plugins/<plugin-id>/`.
- App state is not deleted on uninstall; workspace-scoped state stays under `<workspace>/.sero/apps/<id>/`, and global state under `<SERO_HOME>/apps/<id>/`.

## Key Findings
- Built-in apps/plugins are part of the monorepo and ship with Sero; installed plugins are separate packages stored in the profile agent dir.
- The main sidebar intentionally shows only built-ins plus favourited discovered apps that pass host-compatibility checks.
- The App Store dialog supports:
  - browsing installed apps
  - searching installed apps
  - discovering remote/community plugins
  - installing discovered plugins
  - uninstalling installed plugins from the discover results if they match a currently installed plugin
  - starring/unstarring installed apps as favourites
- Compatibility gates are real: unsupported plugins are filtered out of sidebar presentation and may show an “Unsupported host” message in the card.
- Search/discovery is explicitly framed as community/public search, not a vetted marketplace.
- Uninstall removes the plugin from disk and settings, but leaves app state files alone.
- After install/uninstall, the host refreshes discovery, invalidates caches, and reloads active chat-session resources; this supports docs that say changes take effect immediately, but avoid promising universal update reliability.
- `DEFAULT_FAVOURITE_APP_IDS` currently seeds `admin`, `cron`, and `git`, which are built-ins/internal plugins shown by default in the sidebar.

## Gotchas
- Do not claim a stable marketplace, reviewed plugins, or official support for discovered plugins; source docs explicitly warn against that.
- Do not claim sandboxed or hardened third-party plugin security; security docs say plugin code is part of the security surface.
- Do not overstate auto-update or update management; the source inspected exposes install/uninstall/search, but no public update flow surfaced here.
- Do not say all external examples are supported; docs explicitly frame third-party/community plugins as trusted-source only.
- Do not imply uninstall cleans up all plugin data; app state is intentionally retained.
- Avoid saying built-ins are “favorites” in the same sense as discovered apps; code excludes built-ins from favourite toggling.
- Keep macOS/source-only alpha caveats visible in the guide, especially around trust, compatibility, and local-source installs.
