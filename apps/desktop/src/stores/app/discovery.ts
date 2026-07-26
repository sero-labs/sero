import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { persistLayout } from '@/lib/persist-layout';
import {
  invalidateRemote,
  preloadFederatedModule,
  registerDynamicRemote,
  setIncompatibleApps,
} from '@/lib/federation-registry';
import {
  areStringArraysEqual,
  BUILTIN_APPS,
  BUILTIN_APP_IDS,
  getPriorityPreloadApps,
  isManifestHostSupported,
  manifestToEntry,
  normaliseChromeShortcutsForApps,
  type AppEntry,
} from './shared';
import { useNavigationStore } from '@/stores/navigation';
import { useAppStore } from './state';

function reconcileDiscoveredApps(discovered: AppEntry[]): void {
  const nextApps = [...BUILTIN_APPS, ...discovered];
  const {
    activeApp,
    pendingApp,
    favouriteApps,
    chromeShortcuts,
  } = useAppStore.getState();
  const validIds = new Set(
    nextApps
      .filter((app) => app.builtin || isManifestHostSupported(app.manifest))
      .map((app) => app.id),
  );

  const nextActiveApp = validIds.has(activeApp) ? activeApp : 'dashboard';
  const nextPendingApp = pendingApp && validIds.has(pendingApp) ? pendingApp : null;
  const nextFavouriteApps = favouriteApps.filter((id) => validIds.has(id) && !BUILTIN_APP_IDS.has(id));
  const nextChromeShortcuts = normaliseChromeShortcutsForApps(chromeShortcuts, nextApps);

  useAppStore.setState({
    apps: nextApps,
    activeApp: nextActiveApp,
    pendingApp: nextPendingApp,
    favouriteApps: nextFavouriteApps,
    chromeShortcuts: nextChromeShortcuts,
  });

  if (nextActiveApp !== activeApp) {
    persistLayout({ activeApp: nextActiveApp });
    // The active app vanished (unsupported/uninstalled); record the fallback
    // so navigation history's cursor tracks what's actually on screen.
    useNavigationStore.getState().push({ appId: nextActiveApp });
  }

  if (!areStringArraysEqual(nextFavouriteApps, favouriteApps)) {
    persistLayout({ favouriteApps: nextFavouriteApps });
  }

  if (!areStringArraysEqual(nextChromeShortcuts, chromeShortcuts)) {
    persistLayout({ chromeShortcuts: nextChromeShortcuts });
  }
}

function getPluginChangeAppId(event: PluginChangeEvent): string | null {
  if (event.type === 'installed') return event.manifest.id;
  return event.pluginId;
}

function getPluginChangeManifest(event: PluginChangeEvent): SeroAppManifest | null {
  if (event.type === 'installed') return event.manifest;
  return 'manifest' in event ? event.manifest ?? null : null;
}

/**
 * Local dev-session edits (UI or backend) deliver a freshly-validated,
 * cache-busted manifest — the same data a full re-discovery would return.
 * For these we can patch the single affected app in place rather than
 * re-running discovery, which keeps the surrounding host state intact.
 */
function isInPlaceDevSessionReason(event: PluginChangeEvent): boolean {
  return (
    event.type === 'changed' &&
    (event.reason === 'dev-session-ui-changed' || event.reason === 'dev-session-refreshed')
  );
}

/**
 * Discover sero apps and merge them into the store.
 * Built-in apps are always first; discovered apps follow.
 */
export async function discoverAndRegisterApps(): Promise<void> {
  try {
    const manifests = await window.sero.apps.discover();
    const discovered = manifests.map(manifestToEntry);

    // Block incompatible plugins before anything can preload or mount them.
    setIncompatibleApps(
      manifests
        .filter((manifest: SeroAppManifest) => manifest.hostCompatibility?.supported === false)
        .map((manifest: SeroAppManifest) => manifest.id),
    );

    // Register app entries immediately (needed for sidebar rendering) and
    // reconcile favourites / active app if a plugin was removed.
    reconcileDiscoveredApps(discovered);

    // Only preload the active app + favourites — not all 20+ apps.
    // Other apps load on-demand inside a React transition (no flicker).
    const { activeApp, favouriteApps } = useAppStore.getState();
    const priorityApps = getPriorityPreloadApps(manifests, activeApp, favouriteApps);

    if (priorityApps.length > 0) {
      const PRELOAD_TIMEOUT_MS = 5000;
      const preloads = priorityApps.map((manifest) =>
        preloadFederatedModule(
          manifest.id,
          manifest.component!,
          manifest.devPort,
          manifest.remoteEntryOverride,
        ),
      );

      // Wait for priority preloads, but don't block forever if a remote is down.
      await Promise.race([
        Promise.allSettled(preloads),
        new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT_MS)),
      ]);
    }

    useAppStore.setState({ appsReady: true });
  } catch (err) {
    console.error('[app-store] Failed to discover apps:', err);
    useAppStore.setState({ appsReady: true });
  }
}

/** Apply a plugin install/uninstall or dev-session change to the app registry. */
export async function handlePluginChange(event: PluginChangeEvent): Promise<void> {
  const appId = getPluginChangeAppId(event);
  const manifest = getPluginChangeManifest(event);

  if (appId) {
    const detail = event.reason ? ` (${event.reason})` : '';
    console.log(`[app-store] Plugin changed${detail}: ${appId}`);
    invalidateRemote(appId);
    if (manifest?.component) {
      void registerDynamicRemote(appId, manifest.devPort, manifest.remoteEntryOverride);
    }
  } else {
    console.log('[app-store] Plugin change without app id; rediscovering apps.');
  }

  // Apply local dev-session edits in place instead of re-discovering every app.
  // UI-only edits always take this path; backend (`extension/`, `runtime/`, …)
  // refreshes take it too once the app is already registered, so editing plugin
  // backend code no longer tears down and reloads the whole Sero host. A
  // not-yet-registered session still falls through to full discovery so the new
  // app appears in the registry.
  if (appId && manifest && isInPlaceDevSessionReason(event)) {
    const appState = useAppStore.getState();
    const appAlreadyRegistered = appState.apps.some((entry) => entry.id === appId);
    if (event.reason === 'dev-session-ui-changed' || appAlreadyRegistered) {
      useAppStore.setState({
        apps: appState.apps.map((entry) => (
          entry.id === appId ? manifestToEntry(manifest) : entry
        )),
      });
      if (appState.activeApp === appId) {
        useAppStore.getState().reloadApp(appId);
      }
      return;
    }
  }

  await discoverAndRegisterApps();

  if (event.type === 'installed') {
    useAppStore.getState().setActiveApp(event.manifest.id);
    return;
  }

  const appState = useAppStore.getState();
  if (appId && appState.activeApp === appId) {
    appState.reloadApp(appId);
  }
}
