/**
 * Background model catalog refresh.
 *
 * Pi overlays a remote catalog from pi.dev on the built-in provider model
 * definitions. Sero pins a Pi version that carries the overlay but never
 * triggered it, so a window left open served a frozen model list. This module
 * refreshes once after startup and then every six hours.
 *
 * It must not hang off `ensureInfra()`. That function is lazy and heavy and is
 * called from many places, so a timer there would multiply the schedule.
 *
 * Window creation, the first model list, and any turn are never blocked by a
 * refresh. The shared queue owns the timeout and serializes this work against a
 * credential change.
 */

import { app } from 'electron';
import {
  isModelNetworkDisabled,
  queueModelAvailabilityRefresh,
} from '@electron/ipc/agent/core/model-availability-refresh';

/**
 * Six hours matches the updater's cadence. Pi suppresses a real catalog fetch
 * for four hours per provider, so a shorter interval buys nothing.
 */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Run one refresh.
 *
 * An offline intent skips the tick entirely. The stored catalog was already
 * applied when the runtime was created with network access disabled, so the
 * tick has nothing to add and must not reach the network.
 *
 * `refreshModelAvailability` reports provider failures in its result and
 * warns; this catch covers an unexpected throw such as a failed infra start.
 */
async function runModelCatalogRefresh(): Promise<void> {
  if (isModelNetworkDisabled()) {
    console.info('[model-catalog] Offline; skipping model catalog refresh');
    return;
  }
  try {
    await queueModelAvailabilityRefresh();
  } catch (error) {
    console.error('[model-catalog] Model catalog refresh failed:', error);
  }
}

/**
 * Start the startup refresh and the interval, then stop both on quit.
 *
 * The startup refresh is deliberately not awaited: opening the window and
 * listing models must not wait for a network round trip.
 */
export function startModelCatalogRefresh(): void {
  if (timer) return;
  void runModelCatalogRefresh();
  timer = setInterval(() => void runModelCatalogRefresh(), REFRESH_INTERVAL_MS);
  app.on('before-quit', stopModelCatalogRefresh);
}

/** Stop the interval. Safe to call more than once. */
export function stopModelCatalogRefresh(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
