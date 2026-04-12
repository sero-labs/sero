const workspaceWatchRefCounts = new Map<string, number>();

function ensureWorkspaceWatch(workspaceId: string): void {
  void window.sero.filetree.watch(workspaceId);
}

function releaseWorkspaceWatch(workspaceId: string): void {
  void window.sero.filetree.unwatch(workspaceId);
}

export function retainWorkspaceFiletreeWatch(workspaceId: string): () => void {
  const nextRefCount = (workspaceWatchRefCounts.get(workspaceId) ?? 0) + 1;
  workspaceWatchRefCounts.set(workspaceId, nextRefCount);

  if (nextRefCount === 1) {
    ensureWorkspaceWatch(workspaceId);
  }

  return () => {
    const currentRefCount = workspaceWatchRefCounts.get(workspaceId);
    if (!currentRefCount) return;

    if (currentRefCount === 1) {
      workspaceWatchRefCounts.delete(workspaceId);
      releaseWorkspaceWatch(workspaceId);
      return;
    }

    workspaceWatchRefCounts.set(workspaceId, currentRefCount - 1);
  };
}

export function refreshWorkspaceFiletreeWatch(workspaceId: string): void {
  if (!workspaceWatchRefCounts.has(workspaceId)) return;
  ensureWorkspaceWatch(workspaceId);
}

export function resetWorkspaceFiletreeWatchRefsForTests(): void {
  workspaceWatchRefCounts.clear();
}
