/**
 * Runtime-to-UI events for app runtimes.
 *
 * An app runtime calls `ctx.host.ui.emit(topic, payload)`. The event goes only
 * to the windows of that app that subscribe to the topic in that workspace.
 * Nothing is persisted.
 */

import type { WebContents } from 'electron';
import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { AppRuntimeEvent } from '@/types/ipc';
import { sendToWindows } from '../lib/window-broadcast';

/**
 * Subscribed `appId\u0000workspaceId\u0000topic` triples per renderer window, each
 * with a count.
 *
 * A count, not a set: several views of one app can show the same topic at once
 * (a Workflow page's top bar and its Refine plan both follow the running call),
 * and the first of them to unmount must not stop delivery for the others.
 */
const subscriptions = new Map<number, Map<string, number>>();

/** Windows whose destruction handler is already attached. */
const cleanupBoundWindows = new Set<number>();

function subscriptionKey(appId: string, workspaceId: string, topic: string): string {
  return `${appId}\u0000${workspaceId}\u0000${topic}`;
}

function bindWindowCleanup(webContents: WebContents): void {
  const id = webContents.id;
  if (cleanupBoundWindows.has(id)) return;
  cleanupBoundWindows.add(id);
  webContents.once('destroyed', () => {
    cleanupBoundWindows.delete(id);
    subscriptions.delete(id);
  });
}

/**
 * Send an event to every view that subscribes to it.
 * The payload must be structured-cloneable; a runtime that sends anything else
 * simply reaches no view.
 */
export function emitAppRuntimeEvent(
  appId: string,
  workspaceId: string,
  topic: string,
  payload: unknown,
): void {
  const wanted = subscriptionKey(appId, workspaceId, topic);
  const event: AppRuntimeEvent = { appId, workspaceId, topic, payload };

  for (const [webContentsId, counts] of subscriptions) {
    if (!counts.has(wanted)) continue;
    sendToWindows(new Set([webContentsId]), IpcChannels.appRuntime.event, event);
  }
}

/** Register subscribe/unsubscribe handlers for app-runtime UI events. */
export function registerAppRuntimeEventHandlers(): void {
  ipcMain.handle(
    IpcChannels.appRuntime.subscribe,
    (event, appId: string, workspaceId: string, topic: string): void => {
      bindWindowCleanup(event.sender);
      let counts = subscriptions.get(event.sender.id);
      if (!counts) {
        counts = new Map();
        subscriptions.set(event.sender.id, counts);
      }
      const key = subscriptionKey(appId, workspaceId, topic);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
  );

  ipcMain.handle(
    IpcChannels.appRuntime.unsubscribe,
    (event, appId: string, workspaceId: string, topic: string): void => {
      const counts = subscriptions.get(event.sender.id);
      if (!counts) return;
      const key = subscriptionKey(appId, workspaceId, topic);
      const remaining = (counts.get(key) ?? 0) - 1;
      if (remaining > 0) {
        counts.set(key, remaining);
        return;
      }
      counts.delete(key);
      if (counts.size === 0) subscriptions.delete(event.sender.id);
    },
  );
}
