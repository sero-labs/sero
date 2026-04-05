/**
 * Per-workspace ExplorerWorkspace UI state — sidebar, active panel,
 * terminal panel visibility.
 *
 * Separated from terminal store so sidebar concerns don't couple
 * to terminal tab management.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ExplorerPanel } from '@/components/apps/explorer/ActivityBar';

export interface WorkspaceExplorer {
  sidebarOpen: boolean;
  activePanel: ExplorerPanel;
  terminalOpen: boolean;
  /** Last expanded size of the sidebar as percentage. */
  explorerSidebarSizePct: number;
  /** Last expanded size of the terminal panel as percentage. */
  terminalSizePct: number;
}

const DEFAULT_EXPLORER_CONFIG: WorkspaceExplorer = {
  sidebarOpen: true,
  activePanel: 'explorer',
  terminalOpen: false,
  explorerSidebarSizePct: 0,
  terminalSizePct: 30,
};

interface ExplorerState {
  /** Per-workspace UI state. */
  ui: Record<string, WorkspaceExplorer>;

  /** Get UI state for a workspace (with defaults). */
  get: (workspaceId: string) => WorkspaceExplorer;
  /** Partial-update UI state for a workspace. */
  set: (workspaceId: string, update: Partial<WorkspaceExplorer>) => void;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  ui: {},

  get: (workspaceId) => get().ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG,

  set: (workspaceId, update) =>
    set((s) => {
      const current = s.ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG;
      return { ui: { ...s.ui, [workspaceId]: { ...current, ...update } } };
    }),
}));

// ── Selector hook ──────────────────────────────────────────────

/** Get ExplorerWorkspace UI state for a workspace (reactive). */
export function useWorkspaceExplorer(workspaceId: string): WorkspaceExplorer {
  return useExplorerStore(
    useShallow((s) => s.ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG),
  );
}
