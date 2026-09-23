import { handlePluginChange } from './discovery';
import { useAppStore } from './state';

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
