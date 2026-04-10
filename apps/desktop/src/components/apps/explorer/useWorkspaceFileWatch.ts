import { useEffect, useMemo } from 'react';
import type { EditorRoot } from '@/types/ipc';

export function useWorkspaceFileWatch(workspaceId: string, roots: EditorRoot[]): void {
  const rootsSignature = useMemo(
    () => roots.map((root) => `${root.id}:${root.virtualPath}:${root.kind ?? 'folder'}`).join('|'),
    [roots],
  );

  useEffect(() => {
    void window.sero.filetree.watch(workspaceId);
    return () => {
      void window.sero.filetree.unwatch(workspaceId);
    };
  }, [workspaceId, rootsSignature]);
}
