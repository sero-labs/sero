import { useEffect, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useVcsStore } from '@/stores/vcs';
import { useWorkspaceStore } from '@/stores/workspace';

/**
 * Owns non-visual explorer lifecycle wiring: terminal exit events, VCS event
 * subscriptions/watchers, and default-terminal bootstrap when the panel opens.
 */
export function useExplorerRuntimeEffects(
  workspaceId: string,
  terminalOpen: boolean,
  terminalTabCount: number,
) {
  const loadVcsWorkspace = useVcsStore((state) => state.loadWorkspace);
  const initVcsEventListener = useVcsStore((state) => state.initEventListener);
  const workspacePath = useWorkspaceStore(
    (state) => state.workspaces.find((ws) => ws.id === workspaceId)?.path ?? null,
  );
  const autoCreatingRef = useRef(false);

  useEffect(() => {
    const cleanup = useTerminalStore.getState().initExitListener();
    return cleanup;
  }, []);

  useEffect(() => {
    const unsubscribeVcs = initVcsEventListener();
    return unsubscribeVcs;
  }, [initVcsEventListener]);

  useEffect(() => {
    void loadVcsWorkspace(workspaceId);
    if (!workspacePath) return;
    // One repo-state cache: subscribe to the pushed git state file (the same
    // source the titlebar and git app read).
    return useVcsStore.getState().subscribeGitState(workspaceId, workspacePath);
  }, [workspaceId, workspacePath, loadVcsWorkspace]);

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
