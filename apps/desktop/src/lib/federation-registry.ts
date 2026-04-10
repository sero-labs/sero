/**
 * Federation Registry — dynamically loads federated app components via MF runtime.
 *
 * The MF Vite plugin only registers remotes that have static import() calls.
 * Since we load everything dynamically, we must register remotes ourselves
 * at runtime via registerRemotes() before calling loadRemote().
 *
 * Remote discovery happens at build time in vite.config.ts (auto-scans
 * packages/pi-* and plugins/sero-*-plugin for sero.app manifests). No per-app
 * edits needed here.
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
type RemoteModule = { default: React.ComponentType };
type LoadedRemoteModule = { entry: string; mod: RemoteModule };

/** Maximum number of resolved modules to keep in memory. */
const MAX_CACHED_MODULES = 5;

/** Cache of lazy wrappers — prevents creating a new wrapper on every render. */
const cache = new Map<string, LazyComponent>();

/** Cache of eagerly-resolved components from preloading or on-demand loading. */
const resolvedModules = new Map<string, React.ComponentType>();

/** LRU access order — most recently accessed key is at the end. */
const accessOrder: string[] = [];

/** App IDs that are pinned (background apps) — exempt from eviction. */
const pinnedApps = new Set<string>();

/** Track the currently registered remote entry for each app. */
const registeredEntries = new Map<string, string>();

/** Cache of manifest reachability checks keyed by remote entry URL. */
const manifestReachable = new Map<string, boolean>();

/** Apps whose current cache was populated from a fallback bundle. */
const transientApps = new Set<string>();

/** Derive the MF remote name from a sero app id. */
function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

/** Return the remote entry URL candidates for an app. */
function getRemoteEntryCandidates(appId: string, devPort: number | undefined): string[] {
  if (process.env.NODE_ENV === 'development' && devPort) {
    return [
      `http://localhost:${devPort}/mf-manifest.json`,
      `sero-ext://${appId}/mf-manifest.json`,
    ];
  }
  return [`sero-ext://${appId}/mf-manifest.json`];
}

function isHttpEntry(entry: string): boolean {
  return entry.startsWith('http://') || entry.startsWith('https://');
}

/**
 * Best-effort manifest reachability check.
 *
 * Only successful HTTP(S) probes are cached. Failures are intentionally
 * re-checked on the next load attempt so a slow-starting dev server can be
 * retried later in the same session.
 */
async function isRemoteEntryReachable(entry: string): Promise<boolean> {
  const cached = manifestReachable.get(entry);
  if (cached !== undefined) return cached;

  if (!isHttpEntry(entry)) {
    return true;
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 1500);

  try {
    const response = await globalThis.fetch(entry, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.ok) {
      manifestReachable.set(entry, true);
      return true;
    }
    manifestReachable.delete(entry);
    return false;
  } catch {
    manifestReachable.delete(entry);
    return false;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/** Register a remote entry with the MF runtime if needed. */
function registerRemoteEntry(appId: string, entry: string): void {
  const remoteName = toRemoteName(appId);
  const currentEntry = registeredEntries.get(appId);
  if (currentEntry === entry) return;

  try {
    registerRemotes([{ name: remoteName, entry }], { force: true });
    registeredEntries.set(appId, entry);
  } catch (err) {
    // Already registered by the MF plugin (e.g. if a static import exists)
    console.warn(`[federation] registerRemotes for ${remoteName}:`, err);
    registeredEntries.set(appId, entry);
  }
}

/** Touch a cache key, moving it to the end of the LRU access list. */
function touchLRU(cacheKey: string): void {
  const idx = accessOrder.indexOf(cacheKey);
  if (idx !== -1) accessOrder.splice(idx, 1);
  accessOrder.push(cacheKey);
}

function getCacheAppId(cacheKey: string): string {
  const idx = cacheKey.indexOf('/');
  return idx === -1 ? cacheKey : cacheKey.slice(0, idx);
}

/** Evict least-recently-used entries that exceed MAX_CACHED_MODULES. */
function evictLRU(): void {
  const nonPinned = accessOrder.filter((key) => !pinnedApps.has(getCacheAppId(key)));
  while (nonPinned.length > MAX_CACHED_MODULES) {
    const victim = nonPinned.shift()!;
    resolvedModules.delete(victim);
    cache.delete(victim);
    const idx = accessOrder.indexOf(victim);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }
}

/** Remove all cached wrappers and resolved modules for an app. */
function clearAppCache(appId: string): void {
  const keys = new Set([...cache.keys(), ...resolvedModules.keys()]);
  for (const key of keys) {
    if (getCacheAppId(key) !== appId) continue;
    cache.delete(key);
    resolvedModules.delete(key);
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }
}

/** Mark whether an app should be treated as a transient fallback cache. */
function updateTransientState(appId: string, devPort: number | undefined, entry: string): void {
  if (devPort && !isHttpEntry(entry)) {
    transientApps.add(appId);
    return;
  }

  transientApps.delete(appId);
}

/** Resolve the best remote entry for an app, preferring dev servers when they are reachable. */
async function resolveRemoteEntry(appId: string, devPort: number | undefined): Promise<string> {
  const candidates = getRemoteEntryCandidates(appId, devPort);
  for (const entry of candidates) {
    if (await isRemoteEntryReachable(entry)) return entry;
  }
  return candidates[candidates.length - 1];
}

/**
 * Load a remote module, trying dev and built fallback entries if needed.
 */
async function loadRemoteModule(
  appId: string,
  component: string,
  devPort: number | undefined,
): Promise<LoadedRemoteModule | null> {
  const remoteName = toRemoteName(appId);
  const modulePath = `${remoteName}/${component}`;
  const candidates = getRemoteEntryCandidates(appId, devPort);

  for (const entry of candidates) {
    if (!(await isRemoteEntryReachable(entry))) continue;

    registerRemoteEntry(appId, entry);

    try {
      const mod = await loadRemote<RemoteModule>(modulePath);
      if (mod?.default) {
        updateTransientState(appId, devPort, entry);
        return { entry, mod };
      }
    } catch (err) {
      // If this entry was a dev server and it disappeared between the probe
      // and the load, clear the cached availability and try the fallback.
      manifestReachable.delete(entry);
      console.warn(`[federation] Failed to load ${modulePath} from ${entry}:`, err);
    }
  }

  return null;
}

/**
 * Refresh a transient fallback cache before activating an app.
 *
 * If the app was previously rendered from the bundled fallback because the
 * dev server was unreachable, this clears the stale cache so the next preload
 * can probe for the dev server again.
 */
export function refreshTransientRemote(appId: string): void {
  if (!transientApps.has(appId)) return;

  transientApps.delete(appId);
  registeredEntries.delete(appId);
  clearAppCache(appId);
}

/** Check whether an app currently has a transient fallback cache. */
export function hasTransientRemote(appId: string): boolean {
  return transientApps.has(appId);
}

/** Register a dynamically-installed plugin remote. */
export async function registerDynamicRemote(appId: string, devPort?: number): Promise<void> {
  const entry = await resolveRemoteEntry(appId, devPort);
  registerRemoteEntry(appId, entry);
}

/** Invalidate a dynamically-installed plugin's cache entries. */
export function invalidateRemote(appId: string): void {
  transientApps.delete(appId);
  registeredEntries.delete(appId);
  clearAppCache(appId);
}


/**
 * Eagerly load a federated module at startup.
 */
export async function preloadFederatedModule(
  appId: string,
  component: string,
  devPort: number | undefined,
): Promise<void> {
  const cacheKey = `${appId}/${component}`;
  if (resolvedModules.has(cacheKey) || cache.has(cacheKey)) return;

  const loaded = await loadRemoteModule(appId, component, devPort);
  if (loaded?.mod.default) {
    resolvedModules.set(cacheKey, loaded.mod.default);
    touchLRU(cacheKey);
    evictLRU();
  }
}

/**
 * Get a component for a discovered app.
 */
export function getFederatedComponent(
  appId: string,
  component: string | null,
  devPort: number | undefined,
): LazyComponent | null {
  if (!component) return null;

  const cacheKey = `${appId}/${component}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    touchLRU(cacheKey);
    return cached;
  }

  const resolved = resolvedModules.get(cacheKey);
  if (resolved) {
    const LazyComp = lazy(() => Promise.resolve({ default: resolved }));
    cache.set(cacheKey, LazyComp);
    touchLRU(cacheKey);
    return LazyComp;
  }

  const LazyComp = lazy(async () => {
    const loaded = await loadRemoteModule(appId, component, devPort);
    if (!loaded) {
      console.error(`[federation] Failed to load remote: ${toRemoteName(appId)}/${component}`);
      return { default: () => null };
    }

    resolvedModules.set(cacheKey, loaded.mod.default);
    touchLRU(cacheKey);
    evictLRU();
    return loaded.mod;
  });

  cache.set(cacheKey, LazyComp);
  return LazyComp;
}
