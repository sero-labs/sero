interface ShellHost {
  shell?: { showItemInFolder?(fullPath: string): Promise<void> };
}

function shell(): ShellHost['shell'] {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { sero?: ShellHost }).sero?.shell;
}

/** The web remote has no Finder, so it does not show an action it cannot run. */
export function canShowItemInFolder(): boolean {
  return typeof shell()?.showItemInFolder === 'function';
}

/** Use the existing generic shell bridge. No plugin-specific IPC is needed. */
export async function showItemInFolder(fullPath: string): Promise<void> {
  await shell()?.showItemInFolder?.(fullPath);
}
