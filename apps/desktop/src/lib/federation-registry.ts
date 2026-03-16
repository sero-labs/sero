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
 * ## Preload + LRU eviction strategy
 *
 * At startup, only the active app and favourites are preloaded (not all apps).
 * Other apps are loaded on-demand inside a React transition so the previous
 * app stays visible while the new one resolves — no Suspense flash.
 *
 * An LRU cache evicts resolved modules that haven't been accessed recently,
 * recovering memory from apps the user is no longer viewing. Apps that
 * declare `background: true` in their manifest are exempt from eviction.
 */

import { lazy } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

/**
 * Maximum number of resolved modules to keep in memory.
 * The active app + a few recently-used ones stay cached; older entries
 * are evicted to free memory. Pinned (background) apps don't count
 * toward this limit.
 */
const MAX_CACHED_MODULES = 5;

/** Cache of lazy wrappers — prevents creating a new wrapper on every render. */
const cache = new Map<string, LazyComponent>();

/**
 * Cache of eagerly-resolved components from preloading or on-demand loading.
 * Evicted via LRU when the cache exceeds MAX_CACHED_MODULES.
 */
const resolvedModules = new Map<string, React.ComponentType>();

/** LRU access order — most recently accessed key is at the end. */
const accessOrder: string[] = [];

/** App IDs that are pinned (background apps) — exempt from eviction. */
const pinnedApps = new Set<string>();

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

/** Touch a cache key, moving it to the end of the LRU access list. */
function touchLRU(cacheKey: string): void {
  const idx = accessOrder.indexOf(cacheKey);
  if (idx !== -1) accessOrder.splice(idx, 1);
  accessOrder.push(cacheKey);
}

/** Evict least-recently-used entries that exceed MAX_CACHED_MODULES. */
function evictLRU(): void {
  // Count non-pinned entries
  const nonPinned = accessOrder.filter((k) => !pinnedApps.has(k.split('/')[0]));
  while (nonPinned.length > MAX_CACHED_MODULES) {
    const victim = nonPinned.shift()!;
    resolvedModules.delete(victim);
    cache.delete(victim);
    const idx = accessOrder.indexOf(victim);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }
}

/**
 * Pin an app so it's never evicted from the cache.
 * Use for apps that declare `background: true` in their manifest.
 */
export function pinApp(appId: string): void {
  pinnedApps.add(appId);
}

/**
 * Eagerly load a federated module at startup.
 *
 * Resolves the remote component and caches it so that the first
 * `getFederatedComponent()` call returns an already-settled lazy wrapper
 * — no Suspense fallback flash.
 *
 * Called during `discoverAndRegisterApps()` for the active app and
 * favourites only. Errors are swallowed (the app will show a
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
      touchLRU(cacheKey);
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
 * Call site should wrap app switches in `startTransition` so React keeps
 * showing the previous app while a non-preloaded module resolves.
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
  if (cached) {
    touchLRU(cacheKey);
    return cached;
  }

  // 2. If preloaded, wrap the resolved component — Promise.resolve settles
  //    synchronously so React.lazy won't trigger Suspense.
  const resolved = resolvedModules.get(cacheKey);
  if (resolved) {
    const LazyComp = lazy(() => Promise.resolve({ default: resolved }));
    cache.set(cacheKey, LazyComp);
    touchLRU(cacheKey);
    return LazyComp;
  }

  // 3. Fallback: true lazy load (Suspense will show the spinner only if
  //    the caller didn't wrap the switch in startTransition)
  const remoteName = toRemoteName(appId);
  const modulePath = `${remoteName}/${component}`;

  const LazyComp = lazy(async () => {
    ensureRemoteRegistered(appId, devPort);
    const mod = await loadRemote<{ default: React.ComponentType }>(modulePath);
    if (!mod) {
      console.error(`[federation] Failed to load remote: ${modulePath}`);
      return { default: () => null };
    }
    // Cache the resolved component for future access + LRU tracking
    resolvedModules.set(cacheKey, mod.default);
    touchLRU(cacheKey);
    evictLRU();
    return mod;
  });

  cache.set(cacheKey, LazyComp);
  return LazyComp;
}
