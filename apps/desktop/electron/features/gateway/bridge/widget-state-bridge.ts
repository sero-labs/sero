/**
 * Widget state bridge — carries state-file changes to gateway clients.
 *
 * A remote widget reads its state through `useAppState`, which watches a
 * file. A browser cannot watch a file, so the host watches for it and
 * pushes `app_state_changed` when the file moves.
 *
 * A change goes only to the sockets that asked for that file. A client
 * that never watched a key never hears about it, so a scoped token
 * cannot learn about a workspace it may not reach.
 */

import { WebSocket } from 'ws';
import { appStateManager } from '@electron/features/apps/state/manager';
import type { GatewayAppStateChangedEvent } from '../server/protocol-events';

/** Watching sockets per state file, each with the key it used. */
const watchers = new Map<string, Map<WebSocket, string>>();

let listening = false;

/** Start pushing state changes. Safe to call more than once. */
export function startWidgetStateBridge(): void {
  if (listening) return;
  listening = true;

  appStateManager.onFileChange((filePath, data) => {
    const sockets = watchers.get(filePath);
    if (!sockets || sockets.size === 0) return;

    void appStateManager.readWithEtag(filePath).then(({ etag }) => {
      for (const [ws, key] of sockets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const event: GatewayAppStateChangedEvent = {
          type: 'app_state_changed',
          key,
          data,
          etag,
        };
        ws.send(JSON.stringify(event));
      }
    });
  });
}

/** Watch one state file for one socket, and read it once. */
export async function watchWidgetState(
  ws: WebSocket,
  key: string,
  filePath: string,
): Promise<{ data: unknown; etag: string | null }> {
  startWidgetStateBridge();

  const sockets = watchers.get(filePath) ?? new Map<WebSocket, string>();
  // A repeated watch from one socket must not add a second file watcher.
  if (!sockets.has(ws)) {
    appStateManager.watch(filePath);
    sockets.set(ws, key);
    watchers.set(filePath, sockets);
  }

  return appStateManager.readWithEtag(filePath);
}

/** Stop watching one state file for one socket. */
export function unwatchWidgetState(ws: WebSocket, filePath: string): void {
  const sockets = watchers.get(filePath);
  if (!sockets?.has(ws)) return;

  sockets.delete(ws);
  appStateManager.unwatch(filePath);
  if (sockets.size === 0) watchers.delete(filePath);
}

/** Drop every watch a socket holds. Called when it disconnects. */
export function dropWidgetStateWatches(ws: WebSocket): void {
  for (const [filePath, sockets] of [...watchers]) {
    if (!sockets.has(ws)) continue;
    sockets.delete(ws);
    appStateManager.unwatch(filePath);
    if (sockets.size === 0) watchers.delete(filePath);
  }
}

/** Test seam. Forgets every watch. */
export function resetWidgetStateBridge(): void {
  watchers.clear();
}
