/**
 * Generic host shell bridge — the same seam the desktop status bar uses
 * to reveal the workspace folder. Absent on hosts without a file manager
 * (e.g. web remote), in which case reveal actions are hidden.
 */

interface SeroShellBridge {
  shell?: { showItemInFolder?(fullPath: string): Promise<void> };
}

function seroShell(): SeroShellBridge['shell'] {
  return (window as unknown as { sero?: SeroShellBridge }).sero?.shell;
}

export function canRevealInFolder(): boolean {
  return typeof seroShell()?.showItemInFolder === 'function';
}

export function revealInFolder(fullPath: string): void {
  void seroShell()?.showItemInFolder?.(fullPath);
}
