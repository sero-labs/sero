import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { persistLayout } from '@/lib/persist-layout';
import {
  invalidateRemote,
  preloadFederatedModule,
  registerDynamicRemote,
} from '@/lib/federation-registry';
import {
  areStringArraysEqual,
  BUILTIN_APPS,
  BUILTIN_APP_IDS,
  getPriorityPreloadApps,
  isManifestHostSupported,
  manifestToEntry,
  type AppEntry,
} from './shared';
import { useAppStore } from './state';

function reconcileDiscoveredApps(discovered: AppEntry[]): void {
  const nextApps = [...BUILTIN_APPS, ...discovered];
  const { activeApp, pendingApp, favouriteApps } = useAppStore.getState();
  const validIds = new Set(
    nextApps
      .filter((app) => app.builtin || isManifestHostSupported(app.manifest))
      .map((app) => app.id),
  );

  const nextActiveApp = validIds.has(activeApp) ? activeApp : 'dashboard';
  const nextPendingApp = pendingApp && validIds.has(pendingApp) ? pendingApp : null;
  const nextFavouriteApps = favouriteApps.filter((id) => validIds.has(id) && !BUILTIN_APP_IDS.has(id));

  useAppStore.setState({
    apps: nextApps,
    activeApp: nextActiveApp,
    pendingApp: nextPendingApp,
    favouriteApps: nextFavouriteApps,
  });

  if (nextActiveApp !== activeApp) {
    persistLayout({ activeApp: nextActiveApp });
  }

  if (!areStringArraysEqual(nextFavouriteApps, favouriteApps)) {
    persistLayout({ favouriteApps: nextFavouriteApps });
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
 * Discover sero apps and merge them into the store.
 * Built-in apps are always first; discovered apps follow.
 */
export async function discoverAndRegisterApps(): Promise<void> {
  try {
    const manifests = await window.sero.apps.discover();
    const discovered = manifests.map(manifestToEntry);

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

  await discoverAndRegisterApps();

  const appState = useAppStore.getState();
  if (appId && appState.activeApp === appId) {
    appState.reloadApp(appId);
  }
}
