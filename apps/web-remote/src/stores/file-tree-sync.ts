/**
 * File tree sync — loads the tree, then keeps it live.
 *
 * The tree loads itself when a session is open in a workspace, and the
 * host pushes `file_tree_changed` while it stays open. Nothing polls,
 * and nothing is watched when no session is on screen.
 *
 * One tree belongs to one workspace. Moving to another workspace empties
 * it, so a stale listing can never be read as the new workspace's.
 */

import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import { useFileStore, ROOT_DIR_PATH } from './files';

/** The workspace whose tree should be live now, or null for none. */
function liveWorkspaceId(): string | null {
  if (useConnectionStore.getState().state !== 'connected') return null;

  const { activeWorkspaceId, activeSessionId } = useWorkspaceStore.getState();
  if (!activeWorkspaceId || !activeSessionId) return null;
  return activeWorkspaceId;
}

/**
 * Start the sync. Returns the function that stops it.
 *
 * Call it once, at the app root.
 */
export function startFileTreeSync(): () => void {
  let watched: string | null = null;
  let loaded: string | null = null;

  const apply = () => {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (loaded && loaded !== activeWorkspaceId) {
      useFileStore.getState().resetTree();
      loaded = null;
    }

    const next = liveWorkspaceId();
    if (next === watched) return;

    const { client } = useConnectionStore.getState();
    // A closed socket drops the send, and the host drops the watch with
    // the socket, so a lost connection needs nothing more than this.
    if (watched) client.unwatchFileTree(watched);

    watched = next;
    if (!next) return;

    client.watchFileTree(next);
    useFileStore.getState().fetchDirectory(ROOT_DIR_PATH);
    loaded = next;
  };

  const stops = [
    useConnectionStore.subscribe(apply),
    useWorkspaceStore.subscribe(apply),
  ];
  apply();

  return () => {
    for (const stop of stops) stop();
    if (watched) useConnectionStore.getState().client.unwatchFileTree(watched);
    watched = null;
  };
}
