/**
 * File tree bridge — carries workspace file changes to gateway clients.
 *
 * A browser cannot watch a filesystem, so the host watches for it and
 * pushes `file_tree_changed` when a directory moves.
 *
 * A change goes only to the sockets that asked for that workspace. A
 * client that never watched a workspace never hears about it, so a
 * scoped token cannot learn about a workspace it may not reach.
 *
 * Only the primary root travels. The remote's tree shows that root and
 * nothing else, so a change under a linked root would refresh nothing.
 *
 * A push costs the remote one listing per changed folder, over a phone's
 * network. So the first change goes out at once, and the ones behind it
 * wait for the window to close and travel together.
 */

import { WebSocket } from 'ws';
import { fileWatcherManager } from '@electron/features/workspace/watcher';
import { workspaceWatchRoots } from '@electron/features/workspace/watch-roots';
import { RUNTIME_WORKSPACE_PATH } from '@electron/features/workspace/runtime/runtime-paths';
import type { GatewayFileTreeChangedEvent } from '../server/protocol-events';

/** The owner name the gateway watches under, shared by every socket. */
const GATEWAY_OWNER = 'gateway';

/** Shortest time between two pushes for one workspace, in milliseconds. */
const PUSH_WINDOW_MS = 1000;

/** Watching sockets per workspace id. */
const watchers = new Map<string, Set<WebSocket>>();

/** An open window per workspace, holding what changed inside it. */
interface PushWindow {
  timer: ReturnType<typeof setTimeout>;
  directories: Set<string>;
}

const windows = new Map<string, PushWindow>();

let stopListening: (() => void) | null = null;

/** True for a directory the remote's file tree can show. */
function isPrimaryRootDirectory(directory: string): boolean {
  return directory === RUNTIME_WORKSPACE_PATH
    || directory.startsWith(`${RUNTIME_WORKSPACE_PATH}/`);
}

/** Send one event to every socket watching a workspace. */
function push(workspaceId: string, directories: string[]): void {
  const sockets = watchers.get(workspaceId);
  if (!sockets || sockets.size === 0) return;

  const event: GatewayFileTreeChangedEvent = {
    type: 'file_tree_changed',
    workspaceId,
    directories,
  };
  const payload = JSON.stringify(event);

  for (const ws of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(payload);
  }
}

/**
 * Open a window on a workspace, or hold a change until the open one ends.
 *
 * The window closes empty when nothing arrived inside it, so a quiet
 * workspace holds no timer.
 */
function openWindow(workspaceId: string): void {
  const timer = setTimeout(() => {
    const open = windows.get(workspaceId);
    windows.delete(workspaceId);
    if (!open || open.directories.size === 0) return;

    push(workspaceId, [...open.directories]);
    openWindow(workspaceId);
  }, PUSH_WINDOW_MS);

  // The host must not stay awake for a file tree.
  timer.unref?.();
  windows.set(workspaceId, { timer, directories: new Set() });
}

/** Start pushing file changes. Safe to call more than once. */
export function startFileTreeBridge(): void {
  if (stopListening) return;

  stopListening = fileWatcherManager.onChange((change) => {
    const sockets = watchers.get(change.workspaceId);
    if (!sockets || sockets.size === 0) return;

    const directories = change.directories.filter(isPrimaryRootDirectory);
    if (directories.length === 0) return;

    const open = windows.get(change.workspaceId);
    if (open) {
      for (const directory of directories) open.directories.add(directory);
      return;
    }

    push(change.workspaceId, directories);
    openWindow(change.workspaceId);
  });
}

/** Close a workspace's window and forget what it held. */
function closeWindow(workspaceId: string): void {
  const open = windows.get(workspaceId);
  if (!open) return;
  clearTimeout(open.timer);
  windows.delete(workspaceId);
}

/**
 * Watch one workspace for one socket.
 *
 * Returns false when the workspace has no path on disk, so the caller
 * can say why nothing will arrive.
 */
export async function watchFileTree(ws: WebSocket, workspaceId: string): Promise<boolean> {
  const roots = await workspaceWatchRoots(workspaceId);
  if (!roots) return false;

  startFileTreeBridge();

  const sockets = watchers.get(workspaceId) ?? new Set<WebSocket>();
  sockets.add(ws);
  watchers.set(workspaceId, sockets);

  // One owner covers every socket, so a second watcher never restarts
  // the filesystem watch.
  fileWatcherManager.watch(workspaceId, roots, GATEWAY_OWNER);
  return true;
}

/** Stop watching one workspace for one socket. */
export function unwatchFileTree(ws: WebSocket, workspaceId: string): void {
  const sockets = watchers.get(workspaceId);
  if (!sockets?.has(ws)) return;

  sockets.delete(ws);
  if (sockets.size > 0) return;

  watchers.delete(workspaceId);
  closeWindow(workspaceId);
  fileWatcherManager.unwatch(workspaceId, GATEWAY_OWNER);
}

/** Drop every watch a socket holds. Called when it disconnects. */
export function dropFileTreeWatches(ws: WebSocket): void {
  for (const workspaceId of [...watchers.keys()]) {
    unwatchFileTree(ws, workspaceId);
  }
}

/** Test seam. Forgets every watch. */
export function resetFileTreeBridge(): void {
  for (const workspaceId of watchers.keys()) {
    fileWatcherManager.unwatch(workspaceId, GATEWAY_OWNER);
  }
  for (const workspaceId of [...windows.keys()]) {
    closeWindow(workspaceId);
  }
  watchers.clear();
  stopListening?.();
  stopListening = null;
}
