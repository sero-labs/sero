/**
 * Loads a plugin's dashboard widget into the browser.
 *
 * The gateway serves the plugin's federation manifest and chunks under
 * `/ext/<appId>/`, so a widget is same-origin here. Its URL carries a
 * ticket, which the host checks before it serves a byte.
 *
 * Remotes are registered at runtime, because the widget set is known
 * only after the host lists it.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

type RemoteModule = { default: ComponentType };

/** One lazy wrapper per widget, so a re-render does not remount it. */
const wrappers = new Map<string, LazyExoticComponent<ComponentType>>();

/** Remote entries already registered, keyed by remote name. */
const registered = new Map<string, string>();

/** Where a widget's component lives, and how to reach it. */
export interface RemoteWidgetSource {
  remoteName: string;
  remoteEntry: string;
  component: string;
}

/**
 * One wrapper per widget, not per URL.
 *
 * A ticket rotates, so the entry URL changes within a session. Keying on
 * it would build a new component and remount the widget every time the
 * listing refreshed.
 */
function cacheKey(source: RemoteWidgetSource): string {
  return `${source.remoteName}/${source.component}`;
}

/**
 * Register a remote, or re-register it when its ticket changed.
 *
 * A ticket expires, so the entry URL is not stable across a session.
 */
function ensureRegistered(source: RemoteWidgetSource): void {
  if (registered.get(source.remoteName) === source.remoteEntry) return;

  registerRemotes(
    [{ name: source.remoteName, entry: source.remoteEntry }],
    // A changed ticket must replace the old entry, not sit beside it.
    { force: true },
  );
  registered.set(source.remoteName, source.remoteEntry);
}

/**
 * Fetch one widget's module from its remote.
 *
 * Exported so a test can call it without rendering; the component below
 * is the only caller in the app.
 */
export async function loadWidgetModule(source: RemoteWidgetSource): Promise<RemoteModule> {
  const mod = await loadRemote<RemoteModule>(`${source.remoteName}/${source.component}`);
  if (!mod?.default) {
    throw new Error(`Widget ${source.component} exports no component.`);
  }
  return { default: mod.default };
}

/** The React component for one widget. Suspends while it loads. */
export function widgetComponent(source: RemoteWidgetSource): LazyExoticComponent<ComponentType> {
  // Register before the wrapper check, so a fresh ticket reaches the
  // runtime even for a widget that is already mounted.
  ensureRegistered(source);

  const key = cacheKey(source);
  const existing = wrappers.get(key);
  if (existing) return existing;

  const wrapper = lazy(() => loadWidgetModule(source));

  wrappers.set(key, wrapper);
  return wrapper;
}

/** Test seam. Forgets every loaded widget. */
export function resetFederation(): void {
  wrappers.clear();
  registered.clear();
}
