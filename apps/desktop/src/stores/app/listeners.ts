import { handlePluginChange } from './discovery';
import { useAppStore } from './state';
import { useNavigationStore } from '@/stores/navigation';
import { useWorkspaceStore } from '@/stores/workspace';

/**
 * Listen for new app packages detected by the main process.
 * Call once on startup. Returns an unsubscribe function.
 */
export function listenForNewApps(): () => void {
  const unsubscribeApps = window.sero.apps.onNewAppDetected((appName: string) => {
    console.log(`[app-store] New app detected: ${appName}`);
    useAppStore.setState({ pendingNewApp: appName });
  });

  const unsubscribePlugins = window.sero.plugins.onChanged((event) => {
    void handlePluginChange(event).catch((err) => {
      console.warn('[app-store] Failed to apply plugin change:', err);
    });
  });

  return () => {
    unsubscribeApps();
    unsubscribePlugins();
  };
}

/** Keep the current workspace-scoped app history entry on the open workspace. */
export function listenForAppNavigationWorkspace(): () => void {
  return useWorkspaceStore.subscribe((workspace, previous) => {
    if (workspace.activeWorkspaceId === previous.activeWorkspaceId) return;
    const app = useAppStore.getState();
    const navigation = useNavigationStore.getState();
    const current = navigation.entries[navigation.index];
    const appId = current?.appId ?? app.activeApp;
    const entry = app.apps.find((candidate) => candidate.id === appId);
    if (!entry || entry.builtin || entry.manifest?.scope === 'global') return;

    const workspaceId = workspace.activeWorkspaceId ?? undefined;
    const viewId = workspaceId ? app.appViewIds[appId]?.[workspaceId] : undefined;
    navigation.replaceCurrent({
      appId,
      viewId,
      workspaceId,
    });
  });
}
