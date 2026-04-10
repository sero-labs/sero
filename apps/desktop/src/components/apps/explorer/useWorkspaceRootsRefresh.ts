import { useEffect } from 'react';

export function useWorkspaceRootsRefresh(
  workspaceId: string,
  refreshRoots: () => Promise<void>,
): void {
  useEffect(() => {
    const cleanup = window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;
      if (!data.directories.includes('/workspace')) return;
      void refreshRoots();
    });
    return cleanup;
  }, [workspaceId, refreshRoots]);
}
