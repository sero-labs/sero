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
