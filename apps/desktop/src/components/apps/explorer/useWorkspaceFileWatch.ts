import { useEffect, useMemo, useRef } from 'react';
import type { EditorRoot } from '@/types/ipc';
import {
  hasWorkspaceFiletreeWatch,
  refreshWorkspaceFiletreeWatch,
  retainWorkspaceFiletreeWatch,
} from '@/hooks/workspace-filetree-subscription';

export function useWorkspaceFileWatch(workspaceId: string, roots: EditorRoot[]): void {
  const rootsSignature = useMemo(
    () => roots.map((root) => `${root.id}:${root.virtualPath}:${root.kind ?? 'folder'}`).join('|'),
    [roots],
  );
  const previousRootsSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const hadExistingWatch = hasWorkspaceFiletreeWatch(workspaceId);
    const release = retainWorkspaceFiletreeWatch(workspaceId);
    if (hadExistingWatch || previousRootsSignatureRef.current !== null) {
      refreshWorkspaceFiletreeWatch(workspaceId);
    }
    previousRootsSignatureRef.current = rootsSignature;
    return release;
  }, [workspaceId, rootsSignature]);
}
