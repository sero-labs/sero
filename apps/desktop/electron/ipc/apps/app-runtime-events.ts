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

/** Subscribed `appId\u0000workspaceId\u0000topic` triples, per renderer window. */
const subscriptions = new Map<number, Set<string>>();

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

  for (const [webContentsId, keys] of subscriptions) {
    if (!keys.has(wanted)) continue;
    sendToWindows(new Set([webContentsId]), IpcChannels.appRuntime.event, event);
  }
}

/** Register subscribe/unsubscribe handlers for app-runtime UI events. */
export function registerAppRuntimeEventHandlers(): void {
  ipcMain.handle(
    IpcChannels.appRuntime.subscribe,
    (event, appId: string, workspaceId: string, topic: string): void => {
      bindWindowCleanup(event.sender);
      let keys = subscriptions.get(event.sender.id);
      if (!keys) {
        keys = new Set();
        subscriptions.set(event.sender.id, keys);
      }
      keys.add(subscriptionKey(appId, workspaceId, topic));
    },
  );

  ipcMain.handle(
    IpcChannels.appRuntime.unsubscribe,
    (event, appId: string, workspaceId: string, topic: string): void => {
      const keys = subscriptions.get(event.sender.id);
      if (!keys) return;
      keys.delete(subscriptionKey(appId, workspaceId, topic));
      if (keys.size === 0) subscriptions.delete(event.sender.id);
    },
  );
}
