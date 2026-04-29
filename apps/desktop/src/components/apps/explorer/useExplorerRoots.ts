import { useCallback, useEffect, useState } from 'react';
import type { EditorRoot } from '@/types/ipc';
import { useWorkspaceFileWatch } from './useWorkspaceFileWatch';
import { useWorkspaceRootsRefresh } from './useWorkspaceRootsRefresh';

const DEFAULT_ROOTS: EditorRoot[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    virtualPath: '/workspace',
    kind: 'workspace',
  },
];

/**
 * Owns multi-root discovery/removal for the active explorer workspace.
 */
export function useExplorerRoots(workspaceId: string) {
  // Multi-root workspaces expose all roots via editor.getRoots; the primary
  // root always comes back first as `{ id: 'workspace', virtualPath: '/workspace' }`.
  const [roots, setRoots] = useState<EditorRoot[]>(DEFAULT_ROOTS);

  const refreshRoots = useCallback(async () => {
    try {
      const next = await window.sero.editor.getRoots(workspaceId);
      if (Array.isArray(next) && next.length > 0) {
        setRoots(next);
        return;
      }
    } catch {
      /* fall through to default */
    }
    setRoots(DEFAULT_ROOTS);
  }, [workspaceId]);

  useEffect(() => {
    void refreshRoots();
  }, [refreshRoots]);

  useWorkspaceFileWatch(workspaceId, roots);
  useWorkspaceRootsRefresh(workspaceId, refreshRoots);

  const handleRemoveRoot = useCallback(
    async (rootId: string) => {
      try {
        await window.sero.workspace.removeRoot(workspaceId, rootId);
        await refreshRoots();
      } catch (err) {
        console.warn('[explorer] Failed to remove root:', err);
      }
    },
    [workspaceId, refreshRoots],
  );

  return {
    roots,
    handleRemoveRoot,
  };
}
