import { useEffect, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal';

/**
 * Owns non-visual explorer lifecycle wiring: terminal exit events and
 * default-terminal bootstrap when the panel opens. Git subscriptions belong to
 * the git plugin, which starts them when its view mounts (AD-025).
 */
export function useExplorerRuntimeEffects(
  workspaceId: string,
  terminalOpen: boolean,
  terminalTabCount: number,
) {
  const autoCreatingRef = useRef(false);

  useEffect(() => {
    const cleanup = useTerminalStore.getState().initExitListener();
    return cleanup;
  }, []);

  // Auto-create a default terminal whenever the panel is open but has no tabs.
  // The main process handles container vs host fallback, so we don't gate on
  // container status here.
  useEffect(() => {
    if (terminalTabCount > 0 || autoCreatingRef.current || !terminalOpen) {
      return;
    }
    autoCreatingRef.current = true;
    useTerminalStore
      .getState()
      .createTab(workspaceId)
      .catch((err) => {
        console.warn('[explorer] Failed to auto-create terminal:', err);
      })
      .finally(() => {
        autoCreatingRef.current = false;
      });
  }, [terminalOpen, terminalTabCount, workspaceId]);
}
