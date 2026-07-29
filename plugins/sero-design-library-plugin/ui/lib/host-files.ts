import type { SeroWebHostBridge } from '@sero-ai/common';

function shell(): SeroWebHostBridge['shell'] {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { sero?: SeroWebHostBridge }).sero?.shell;
}

/** A host with no file manager bridge does not show an action it cannot run. */
export function canShowItemInFolder(): boolean {
  return typeof shell()?.showItemInFolder === 'function';
}

/** Use the existing generic shell bridge. No plugin-specific IPC is needed. */
export async function showItemInFolder(fullPath: string): Promise<void> {
  await shell()?.showItemInFolder?.(fullPath);
}
