import type { SeroWebHostBridge } from '@sero-ai/common';

function shell(): SeroWebHostBridge['shell'] {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { sero?: SeroWebHostBridge }).sero?.shell;
}

export function canShowItemInFolder(): boolean {
  return typeof shell()?.showItemInFolder === 'function';
}

export async function showItemInFolder(path: string): Promise<void> {
  await shell()?.showItemInFolder?.(path);
}
