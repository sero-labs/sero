/**
 * useLinkedRoots — manage `linked-plugin` workspace roots for the active workspace.
 *
 * Linked plugins surface external plugin source directories (like `sero/plugins/foo`)
 * inside the explorer for in-place plugin development. They are stored as additional
 * workspace roots and mirrored as container bind-mounts.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSero, type WorkspaceRootIPC } from './host';

export function useLinkedRoots(workspaceId: string | null) {
  const [roots, setRoots] = useState<WorkspaceRootIPC[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setRoots([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getSero().workspace.listRoots(workspaceId);
      setRoots(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list roots');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const linkPlugin = useCallback(async (): Promise<boolean> => {
    if (!workspaceId) {
      setError('Open a workspace to attach folders.');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const sero = getSero();
      const folder = await sero.workspace.pickFolder();
      if (!folder) {
        return false;
      }
      const name = folder.split('/').filter(Boolean).pop() || 'linked';
      await sero.workspace.addRoot(workspaceId, {
        name,
        path: folder,
        kind: 'linked-plugin',
      });
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach folder');
      return false;
    } finally {
      setBusy(false);
    }
  }, [workspaceId, reload]);

  const unlink = useCallback(async (rootId: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await getSero().workspace.removeRoot(workspaceId, rootId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detach folder');
    } finally {
      setBusy(false);
    }
  }, [workspaceId, reload]);

  const revealInFinder = useCallback(async (path: string) => {
    setError(null);
    try {
      await getSero().shell.showItemInFolder(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal folder');
    }
  }, []);

  const linkedPlugins = roots.filter((r) => r.kind === 'linked-plugin');

  return {
    roots,
    linkedPlugins,
    loading,
    busy,
    error,
    linkPlugin,
    unlink,
    revealInFinder,
    reload,
  };
}
