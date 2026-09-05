/**
 * The roots a workspace watch covers.
 *
 * The desktop window and the gateway both ask for the same workspace to
 * be watched. They must ask for the same roots: the watcher restarts
 * when a second owner names a different list. One helper keeps them
 * identical.
 */

import { workspaceManager } from '@electron/features/workspace/manager';
import { PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import type { WorkspaceWatchRoot } from './watcher';

/** Every root of a workspace, primary first. Null when it is unknown. */
export async function workspaceWatchRoots(workspaceId: string): Promise<WorkspaceWatchRoot[] | null> {
  const hostDir = workspaceManager.getPath(workspaceId);
  if (!hostDir) return null;

  const roots = await workspaceManager.getRoots(workspaceId);
  return [
    { hostDir, virtualRoot: `/${PRIMARY_ROOT_ID}` },
    ...roots.map((root) => ({ hostDir: root.path, virtualRoot: `/${root.id}` })),
  ];
}
