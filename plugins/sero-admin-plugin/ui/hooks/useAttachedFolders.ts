/**
 * useAttachedFolders — user-facing wrapper around the internal linked-root hook.
 *
 * The persisted root kind stays `linked-plugin` for v1, but the Admin surface
 * presents these workspace roots as Attached folders.
 */

import { useLinkedRoots } from './useLinkedRoots';

export function useAttachedFolders(workspaceId: string | null) {
  const linkedRoots = useLinkedRoots(workspaceId);

  return {
    roots: linkedRoots.roots,
    attachedFolders: linkedRoots.linkedPlugins,
    loading: linkedRoots.loading,
    busy: linkedRoots.busy,
    error: linkedRoots.error,
    attachFolder: linkedRoots.linkPlugin,
    detachFolder: linkedRoots.unlink,
    revealInFinder: linkedRoots.revealInFinder,
    reload: linkedRoots.reload,
  };
}
