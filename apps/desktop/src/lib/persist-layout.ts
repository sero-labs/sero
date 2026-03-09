/**
 * Shared layout persistence — reads current state from all stores and
 * saves to disk via IPC. Extracted to avoid circular imports between stores.
 */

import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';

export interface PersistedLayoutState {
  mainSidebarOpen: boolean;
  chatPanelOpen: boolean;
  favouriteApps: string[];
  mainSidebarSizePct?: number;
  chatPanelSizePct?: number;
  theme?: string;
  activeWorkspaceId?: string | null;
  activeApp?: string;
  activeSessionId?: string | null;
}

/** Fire-and-forget save of full layout state to disk. */
export function persistLayout(partial: Partial<PersistedLayoutState>): void {
  const app = useAppStore.getState();
  const ws = useWorkspaceStore.getState();
  const sess = useSessionStore.getState();
  const state: PersistedLayoutState = {
    mainSidebarOpen: partial.mainSidebarOpen ?? app.mainSidebarOpen,
    chatPanelOpen: partial.chatPanelOpen ?? app.chatPanelOpen,
    favouriteApps: partial.favouriteApps ?? app.favouriteApps,
    mainSidebarSizePct: partial.mainSidebarSizePct ?? app.mainSidebarSizePct,
    chatPanelSizePct: partial.chatPanelSizePct ?? app.chatPanelSizePct,
    theme: partial.theme ?? app.theme,
    activeWorkspaceId: partial.activeWorkspaceId !== undefined
      ? partial.activeWorkspaceId
      : ws.activeWorkspaceId,
    activeApp: partial.activeApp ?? app.activeApp,
    activeSessionId: partial.activeSessionId !== undefined
      ? partial.activeSessionId
      : sess.activeSessionId,
  };
  window.sero.layout.save(state).catch((err) => {
    console.warn('[persist-layout] Failed to persist layout:', err);
  });
}
