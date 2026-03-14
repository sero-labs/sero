/**
 * Federation Registry — dynamically loads federated app components via MF runtime.
 *
 * The MF Vite plugin only registers remotes that have static import() calls.
 * Since we load everything dynamically, we must register remotes ourselves
 * at runtime via registerRemotes() before calling loadRemote().
 *
 * Remote discovery happens at build time in vite.config.ts (auto-scans
 * packages/pi-* for sero.app manifests). No per-app edits needed here.
 *
 * ## Preload strategy
 *
 * `preloadFederatedModule()` eagerly resolves the remote module at startup
 * (during the loading screen) and caches the resolved component. When
 * `getFederatedComponent()` is later called during render, it wraps the
 * already-resolved component in a `lazy(() => Promise.resolve(...))`.
 * React.lazy recognises the synchronously-settled thenable and renders
 * without triggering Suspense — eliminating the loading-spinner flash
 * on first open.
 */

import { lazy } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

/** Cache of lazy wrappers — prevents creating a new wrapper on every render. */
const cache = new Map<string, LazyComponent>();

/**
 * Cache of eagerly-resolved components from preloading.
 * Populated by `preloadFederatedModule` before the UI renders.
 */
const resolvedModules = new Map<string, React.ComponentType>();

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
 * Eagerly load a federated module at startup.
 *
 * Resolves the remote component and caches it so that the first
 * `getFederatedComponent()` call returns an already-settled lazy wrapper
 * — no Suspense fallback flash.
 *
 * Called during `discoverAndRegisterApps()` and awaited before
 * `appsReady` is set. Errors are swallowed (the app will show a
 * lazy-load error when actually opened).
 */
export async function preloadFederatedModule(
  appId: string,
  component: string,
  devPort: number | undefined,
): Promise<void> {
  const cacheKey = `${appId}/${component}`;
  if (resolvedModules.has(cacheKey) || cache.has(cacheKey)) return;

  ensureRemoteRegistered(appId, devPort);
  const remoteName = toRemoteName(appId);
  const modulePath = `${remoteName}/${component}`;

  try {
    const mod = await loadRemote<{ default: React.ComponentType }>(modulePath);
    if (mod?.default) {
      resolvedModules.set(cacheKey, mod.default);
    }
  } catch (err) {
    // Preload failed — getFederatedComponent will fall back to lazy()
    console.warn(`[federation] preload failed for ${modulePath}:`, err);
  }
}

/**
 * Get a component for a discovered app.
 *
 * If the module was preloaded, returns a lazy wrapper over an already-resolved
 * Promise (no Suspense trigger). Otherwise falls back to a true lazy() load.
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

  // 1. Return cached lazy wrapper if we already have one
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 2. If preloaded, wrap the resolved component — Promise.resolve settles
  //    synchronously so React.lazy won't trigger Suspense.
  const resolved = resolvedModules.get(cacheKey);
  if (resolved) {
    const LazyComp = lazy(() => Promise.resolve({ default: resolved }));
    cache.set(cacheKey, LazyComp);
    return LazyComp;
  }

  // 3. Fallback: true lazy load (Suspense will show the spinner)
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
