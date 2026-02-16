/**
 * Federation Registry — dynamically loads federated app components via MF runtime.
 *
 * The MF Vite plugin only registers remotes that have static import() calls.
 * Since we load everything dynamically, we must register remotes ourselves
 * at runtime via registerRemotes() before calling loadRemote().
 *
 * Remote discovery happens at build time in vite.config.ts (auto-scans
 * packages/pi-* for sero.app manifests). No per-app edits needed here.
 */

import { lazy } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

/** Cache so we don't create a new lazy wrapper on every render. */
const cache = new Map<string, LazyComponent>();

/** Track whether we've registered remotes for a given app. */
const registered = new Set<string>();

/**
 * Derive the MF remote name from a sero app id.
 * e.g. "weight-tracker" → "sero_weight_tracker"
 */
function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

/**
 * Derive the dev manifest URL for a remote.
 * In dev: http://localhost:<port>/mf-manifest.json
 * In prod: resolved by the sero-ext:// protocol (already handled by MF config)
 */
function getRemoteEntry(appId: string, devPort: number | undefined): string {
  if (process.env.NODE_ENV === 'development' && devPort) {
    return `http://localhost:${devPort}/mf-manifest.json`;
  }
  return `sero-ext://${appId}/mf-manifest.json`;
}

/**
 * Ensure a remote is registered with the MF runtime.
 * Called lazily on first load — safe to call multiple times (deduplicates).
 */
function ensureRemoteRegistered(
  appId: string,
  devPort: number | undefined,
): void {
  if (registered.has(appId)) return;

  const remoteName = toRemoteName(appId);
  const entry = getRemoteEntry(appId, devPort);

  try {
    registerRemotes([{ name: remoteName, entry }], { force: false });
    registered.add(appId);
  } catch (err) {
    // Already registered by the MF plugin (e.g. if a static import exists)
    console.warn(`[federation] registerRemotes for ${remoteName}:`, err);
    registered.add(appId);
  }
}

/**
 * Get a lazy-loaded component for a discovered app.
 *
 * Derives the MF module path from the manifest's `id` and `component`:
 *   id: "weight-tracker", component: "WeightTracker"
 *   → loadRemote("sero_weight_tracker/WeightTracker")
 *
 * @param appId      The app's unique id (from sero.app.id)
 * @param component  The exported component name (from sero.app.component)
 * @param devPort    The dev server port (from sero.app.devPort)
 * @returns Lazy React component, or null if component name is missing
 */
export function getFederatedComponent(
  appId: string,
  component: string | null,
  devPort: number | undefined,
): LazyComponent | null {
  if (!component) return null;

  const cacheKey = `${appId}/${component}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const remoteName = toRemoteName(appId);
  const modulePath = `${remoteName}/${component}`;

  const LazyComp = lazy(async () => {
    ensureRemoteRegistered(appId, devPort);
    const mod = await loadRemote<{ default: React.ComponentType }>(modulePath);
    if (!mod) {
      console.error(`[federation] Failed to load remote: ${modulePath}`);
      return { default: () => null };
    }
    return mod;
  });

  cache.set(cacheKey, LazyComp);
  return LazyComp;
}
