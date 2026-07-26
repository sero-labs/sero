/**
 * Federation Registry — dynamically loads federated app components via MF runtime.
 *
 * The MF Vite plugin only registers remotes that have static import() calls.
 * Since we load everything dynamically, we must register remotes ourselves
 * at runtime via registerRemotes() before calling loadRemote().
 *
 * Remote discovery happens at build time in vite.config.ts (auto-scans
 * plugin remotes under plugins/sero-*-plugin for sero.app manifests). No
 * per-app edits needed here.
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
// NOTE: @module-federation/enhanced is pinned to the version line that matches
// @module-federation/vite (pnpm catalog). The vite plugin aliases
// '@module-federation/runtime' to its own CommonJS build, so this entry point
// must stay CommonJS too. Versions that added an ESM `import` condition here
// re-export the aliased CJS module via `export *`, which esbuild pre-bundles
// into a module with no named exports — every import below fails at runtime
// with "does not provide an export named ...". Upgrade both packages together.
import {
  getInstance,
  loadRemote,
  registerRemotes,
  type ModuleFederation,
} from '@module-federation/enhanced/runtime';

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;
type RemoteModule = { default: React.ComponentType };
type LoadedRemoteModule = { entry: string; mod: RemoteModule };
type RuntimeRemote = ModuleFederation['options']['remotes'][number];

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

/** Cache of remote-entry reachability checks keyed by entry URL. */
const manifestReachable = new Map<string, boolean>();

/** Apps whose current cache was populated from a fallback bundle. */
const transientApps = new Set<string>();

/** Derive the MF remote name from a sero app id. */
function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

function normalizeRuntimeRemoteEntry(remoteEntryOverride: string | null): string | null {
  if (!remoteEntryOverride) {
    return null;
  }

  try {
    const url = new URL(remoteEntryOverride);
    if (url.pathname.endsWith('/mf-manifest.json')) {
      url.pathname = `${url.pathname.slice(0, -'/mf-manifest.json'.length)}/remoteEntry.js`;
    }
    return url.toString();
  } catch {
    return remoteEntryOverride.replace(/\/mf-manifest\.json(?=($|[?#]))/, '/remoteEntry.js');
  }
}

function getRemoteCacheKey(
  appId: string,
  component: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
): string {
  return `${appId}/${component}::${normalizeRuntimeRemoteEntry(remoteEntryOverride) ?? (devPort ? `dev:${devPort}` : 'default')}`;
}

/** Return the remote entry URL candidates for an app. */
function getRemoteEntryCandidates(
  appId: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
): string[] {
  const candidates: string[] = [];
  const normalizedOverride = normalizeRuntimeRemoteEntry(remoteEntryOverride);

  if (normalizedOverride) {
    candidates.push(normalizedOverride);
  } else if (process.env.NODE_ENV === 'development' && devPort) {
    candidates.push(`http://localhost:${devPort}/remoteEntry.js`);
  }

  candidates.push(`sero-ext://${appId}/mf-manifest.json`);
  return [...new Set(candidates)];
}

function isHttpEntry(entry: string): boolean {
  return entry.startsWith('http://') || entry.startsWith('https://');
}

function isManifestEntry(entry: string): boolean {
  return /\.json(?=($|[?#]))/.test(entry);
}

function getRuntimeRemoteEntry(remote: RuntimeRemote): string | null {
  return 'entry' in remote && typeof remote.entry === 'string'
    ? remote.entry
    : null;
}

function getRegisteredRuntimeRemote(
  appId: string,
): { instance: ModuleFederation; remote: RuntimeRemote } | null {
  const instance = getInstance();
  if (!instance) {
    return null;
  }

  const remoteName = toRemoteName(appId);
  const remote = instance.options.remotes.find((candidate) => candidate.name === remoteName);
  return remote ? { instance, remote } : null;
}

function hasRemoteRemovalApi(value: unknown): value is {
  removeRemote: (remote: RuntimeRemote) => void;
} {
  return typeof value === 'object'
    && value !== null
    && 'removeRemote' in value
    && typeof Reflect.get(value, 'removeRemote') === 'function';
}

function removeRegisteredRuntimeRemote(appId: string): void {
  const runtimeRemote = getRegisteredRuntimeRemote(appId);
  if (!runtimeRemote) {
    return;
  }

  const remoteHandler: unknown = runtimeRemote.instance.remoteHandler;
  if (!hasRemoteRemovalApi(remoteHandler)) {
    return;
  }

  remoteHandler.removeRemote(runtimeRemote.remote);
}

/**
 * Best-effort remote-entry reachability check.
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

  const existingRuntimeRemote = getRegisteredRuntimeRemote(appId);
  if (existingRuntimeRemote && getRuntimeRemoteEntry(existingRuntimeRemote.remote) === entry) {
    registeredEntries.set(appId, entry);
    return;
  }

  if (existingRuntimeRemote) {
    removeRegisteredRuntimeRemote(appId);
  }

  const remoteRegistration = isManifestEntry(entry)
    ? { name: remoteName, entry }
    : { name: remoteName, entry, type: 'module', entryGlobalName: remoteName };

  try {
    registerRemotes([remoteRegistration], { force: true });
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

/** Remove one cached wrapper/module entry and any LRU bookkeeping for it. */
function clearCacheKey(cacheKey: string): void {
  resolvedModules.delete(cacheKey);
  cache.delete(cacheKey);
  const idx = accessOrder.indexOf(cacheKey);
  if (idx !== -1) accessOrder.splice(idx, 1);
}

/** Evict least-recently-used entries that exceed MAX_CACHED_MODULES. */
function evictLRU(): void {
  const nonPinned = accessOrder.filter((key) => !pinnedApps.has(getCacheAppId(key)));
  while (nonPinned.length > MAX_CACHED_MODULES) {
    clearCacheKey(nonPinned.shift()!);
  }
}

/** Remove all cached wrappers and resolved modules for an app. */
function clearAppCache(appId: string): void {
  const keys = new Set([...cache.keys(), ...resolvedModules.keys()]);
  for (const key of keys) {
    if (getCacheAppId(key) !== appId) continue;
    clearCacheKey(key);
  }
}

/** Mark whether an app should be treated as a transient fallback cache. */
function updateTransientState(
  appId: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
  entry: string,
): void {
  const [preferredEntry] = getRemoteEntryCandidates(appId, devPort, remoteEntryOverride);
  if (preferredEntry && preferredEntry !== entry) {
    transientApps.add(appId);
    return;
  }

  transientApps.delete(appId);
}

/** Resolve the best remote entry for an app, preferring explicit overrides before legacy dev remotes. */
async function resolveRemoteEntry(
  appId: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
): Promise<string> {
  const candidates = getRemoteEntryCandidates(appId, devPort, remoteEntryOverride);
  const reachability = await Promise.all(candidates.map(async (entry) => ({
    entry,
    reachable: await isRemoteEntryReachable(entry),
  })));
  return reachability.find((candidate) => candidate.reachable)?.entry ?? candidates[candidates.length - 1];
}

/**
 * Load a remote module, trying the preferred entry and built fallback if needed.
 */
async function loadRemoteModule(
  appId: string,
  component: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
): Promise<LoadedRemoteModule | null> {
  const remoteName = toRemoteName(appId);
  const modulePath = `${remoteName}/${component}`;
  const candidates = getRemoteEntryCandidates(appId, devPort, remoteEntryOverride);

  const reachability = await Promise.all(candidates.map(async (entry) => ({
    entry,
    reachable: await isRemoteEntryReachable(entry),
  })));
  const reachableEntries = reachability
    .filter((candidate) => candidate.reachable)
    .map((candidate) => candidate.entry);

  const loadFirstReachable = async (index: number): Promise<LoadedRemoteModule | null> => {
    const entry = reachableEntries[index];
    if (!entry) return null;

    registerRemoteEntry(appId, entry);

    try {
      const mod = await loadRemote<RemoteModule>(modulePath);
      if (mod?.default) {
        updateTransientState(appId, devPort, remoteEntryOverride, entry);
        return { entry, mod };
      }
      return loadFirstReachable(index + 1);
    } catch (err) {
      // If the preferred entry disappeared between the probe and the load,
      // clear the cached availability and try the next fallback candidate.
      manifestReachable.delete(entry);
      console.warn(`[federation] Failed to load ${modulePath} from ${entry}:`, err);
      return loadFirstReachable(index + 1);
    }
  };

  return loadFirstReachable(0);
}

/**
 * Refresh a transient fallback cache before activating an app.
 *
 * If the app was previously rendered from the bundled fallback because the
 * preferred remote entry was unreachable, this clears the stale cache so the
 * next preload can probe for the preferred entry again.
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

/** Register a dynamically-discovered plugin remote. */
export async function registerDynamicRemote(
  appId: string,
  devPort?: number,
  remoteEntryOverride: string | null = null,
): Promise<void> {
  const entry = await resolveRemoteEntry(appId, devPort, remoteEntryOverride);
  registerRemoteEntry(appId, entry);
}

/** Invalidate a dynamically-installed plugin's cache entries. */
export function invalidateRemote(appId: string): void {
  transientApps.delete(appId);
  registeredEntries.delete(appId);
  clearAppCache(appId);
}

/**
 * Keep the active app's utility stylesheet last in the cascade.
 *
 * Federated apps build their own Tailwind bundle. Those bundles intentionally
 * reuse utility names, so a later-loaded inactive app can otherwise override
 * responsive variants in the app currently on screen.
 */
export function prioritizeFederatedStyles(appId: string): void {
  if (typeof document === 'undefined') return;

  const entry = registeredEntries.get(appId);
  if (!entry || !URL.canParse(entry)) return;

  const baseUrl = new URL('.', entry).toString();

  const stylesheets = document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
  for (const stylesheet of stylesheets) {
    if (stylesheet.href.startsWith(baseUrl)) {
      document.head.append(stylesheet);
    }
  }
}

/**
 * Eagerly load a federated module at startup.
 */
export async function preloadFederatedModule(
  appId: string,
  component: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null = null,
): Promise<void> {
  const cacheKey = getRemoteCacheKey(appId, component, devPort, remoteEntryOverride);
  if (resolvedModules.has(cacheKey) || cache.has(cacheKey)) return;

  const loaded = await loadRemoteModule(appId, component, devPort, remoteEntryOverride);
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
  remoteEntryOverride: string | null = null,
): LazyComponent | null {
  if (!component) return null;

  const cacheKey = getRemoteCacheKey(appId, component, devPort, remoteEntryOverride);

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
    const loaded = await loadRemoteModule(appId, component, devPort, remoteEntryOverride);
    if (!loaded) {
      console.error(`[federation] Failed to load remote: ${toRemoteName(appId)}/${component}`);
      clearCacheKey(cacheKey);
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
