import { discoverAndRegisterApps, loadLayout } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import { loadWorkspaces } from '@/stores/workspace';

/**
 * Startup order matters:
 * 1. hydrate layout so active app/favourites/workspace are known
 * 2. then start app discovery + workspace/session load in parallel
 */
export async function hydrateShellState(): Promise<void> {
  await loadLayout();
  await Promise.all([
    loadWorkspaces(),
    useSessionStore.getState().loadSessions(),
    discoverAndRegisterApps(),
  ]);
}
