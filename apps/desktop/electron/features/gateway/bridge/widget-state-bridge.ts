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

/** One socket's watch on one file. */
interface WidgetWatch {
  /** The key the socket asked with, echoed on every change. */
  key: string;
  /** Whether the socket's token still covers this file. */
  canReach: () => boolean;
}

/** Watching sockets per state file. */
const watchers = new Map<string, Map<WebSocket, WidgetWatch>>();

let listening = false;

/** Start pushing state changes. Safe to call more than once. */
export function startWidgetStateBridge(): void {
  if (listening) return;
  listening = true;

  // The etag arrives with the data it was computed from. Reading the
  // file again for it would pair one write's data with the next write's
  // etag, and a widget holding that pair could overwrite the newer write.
  appStateManager.onFileChange((filePath, data, etag) => {
    const sockets = watchers.get(filePath);
    if (!sockets || sockets.size === 0) return;

    for (const [ws, watch] of sockets) {
      if (!watch.canReach()) {
        // The socket authenticated again with a scope that no longer
        // covers this file, after this watch was already registering.
        unwatchWidgetState(ws, filePath);
        continue;
      }
      if (ws.readyState !== WebSocket.OPEN) continue;
      const event: GatewayAppStateChangedEvent = {
        type: 'app_state_changed',
        key: watch.key,
        data,
        etag,
      };
      ws.send(JSON.stringify(event));
    }
  });
}

/**
 * Watch one state file for one socket, and read it once.
 *
 * `canReach` is asked again on every change, against the socket's live
 * scope. A watch that finished registering after the socket changed
 * token is dropped at its first change rather than served.
 */
export async function watchWidgetState(
  ws: WebSocket,
  key: string,
  filePath: string,
  canReach: () => boolean = () => true,
): Promise<{ data: unknown; etag: string | null }> {
  startWidgetStateBridge();

  const sockets = watchers.get(filePath) ?? new Map<WebSocket, WidgetWatch>();
  // A repeated watch from one socket must not add a second file watcher.
  if (!sockets.has(ws)) {
    appStateManager.watch(filePath);
    sockets.set(ws, { key, canReach });
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
