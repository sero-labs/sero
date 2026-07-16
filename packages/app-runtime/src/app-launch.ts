/**
 * Cross-app navigation — open another Sero app, optionally handing it launch
 * params (e.g. the Scheduler app opening the Orchestrator on a specific loop).
 *
 * Only the active app is mounted, so the target app always mounts fresh and can
 * consume its pending params in a state initializer. The registry is a
 * globalThis singleton so all module-federation copies share it, matching the
 * AppContext pattern.
 */

import { getSeroApi } from './sero-bridge';

declare global {
  var __sero_app_launch_params__: Map<string, Record<string, unknown>> | undefined;
}

function getRegistry(): Map<string, Record<string, unknown>> {
  globalThis.__sero_app_launch_params__ ??= new Map();
  return globalThis.__sero_app_launch_params__;
}

function launchEventName(appId: string): string {
  return `sero:app-launch:${appId}`;
}

/**
 * Switch the shell to another app. Optional `params` are held for the target
 * app to pick up via `consumeAppLaunchParams` when it mounts. Resolves false
 * when the app is unknown or the shell doesn't expose app control.
 */
export async function openSeroApp(appId: string, params?: Record<string, unknown>): Promise<boolean> {
  if (params) getRegistry().set(appId, params);
  const opened = (await getSeroApi().appControl?.open(appId)) ?? false;
  if (!opened) getRegistry().delete(appId);
  if (opened && params && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(launchEventName(appId), { detail: params }));
  }
  return opened;
}

/**
 * Open a workspace file in the shell's explorer editor. Resolves false when the
 * shell doesn't expose file opening. Used by search panels to make results
 * clickable — `workspaceId` + `filePath` come straight from graph node tags.
 * Opening a file does NOT close the search overlay; the panel decides that via
 * `closeSeroSearch` so it can keep the overlay open for opening several files.
 */
export async function openSeroFile(workspaceId: string, filePath: string): Promise<boolean> {
  return (await getSeroApi().appControl?.openFile(workspaceId, filePath)) ?? false;
}

/** Event the shell's global-search overlay listens for to dismiss itself. */
export const SERO_GLOBAL_SEARCH_CLOSE_EVENT = 'sero:global-search:close';

/**
 * Ask the shell to close the global-search overlay a search panel is mounted in.
 * Uses a window event (same renderer as the host, like `openSeroApp`'s launch
 * events) so panels stay decoupled from the host's store. No-op outside a window.
 */
export function closeSeroSearch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SERO_GLOBAL_SEARCH_CLOSE_EVENT));
}

/**
 * Take (and clear) the launch params another app handed to `openSeroApp`.
 * Call from a mount-time state initializer; returns undefined when the app
 * was opened without params.
 */
export function consumeAppLaunchParams<T extends Record<string, unknown>>(appId: string): T | undefined {
  const registry = getRegistry();
  const params = registry.get(appId);
  registry.delete(appId);
  return params as T | undefined;
}

/**
 * Receives launch params when an already-mounted app is opened again. Apps still
 * consume the registry on mount; this covers same-app deep links without forcing
 * an unnecessary unmount/remount.
 */
export function onAppLaunchParams<T extends Record<string, unknown>>(
  appId: string,
  callback: (params: T) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    getRegistry().delete(appId);
    callback((event as CustomEvent<T>).detail);
  };
  const eventName = launchEventName(appId);
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
