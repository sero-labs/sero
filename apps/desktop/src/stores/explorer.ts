/**
 * Per-workspace ExplorerWorkspace UI state — sidebar, active panel,
 * terminal panel visibility.
 *
 * Separated from terminal store so sidebar concerns don't couple
 * to terminal tab management.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ExplorerPanel } from '@/lib/explorer-panels';
import { persistLayout } from '@/lib/persist-layout';
import type { PersistedWorkspaceExplorerLayout } from '@/types/layout';

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

/**
 * Any non-empty string is a valid panel id: besides the built-ins, apps
 * contribute Explorer views keyed by app id. A persisted id we don't recognise
 * is deliberately kept rather than reset to `explorer` — the contributing
 * plugin may simply not be loaded yet, and the view is restored when it is.
 * Until then the Explorer shows a placeholder (see `ExplorerViewMissing`).
 */
function isExplorerPanel(value: unknown): value is ExplorerPanel {
  return typeof value === 'string' && value.length > 0;
}

function normaliseExplorerLayout(
  layout: PersistedWorkspaceExplorerLayout | undefined,
): WorkspaceExplorer {
  if (!layout) return DEFAULT_EXPLORER_CONFIG;

  return {
    sidebarOpen: typeof layout.sidebarOpen === 'boolean'
      ? layout.sidebarOpen
      : DEFAULT_EXPLORER_CONFIG.sidebarOpen,
    activePanel: isExplorerPanel(layout.activePanel)
      ? layout.activePanel
      : DEFAULT_EXPLORER_CONFIG.activePanel,
    terminalOpen: typeof layout.terminalOpen === 'boolean'
      ? layout.terminalOpen
      : DEFAULT_EXPLORER_CONFIG.terminalOpen,
    explorerSidebarSizePct:
      typeof layout.explorerSidebarSizePct === 'number' && layout.explorerSidebarSizePct > 0
        ? layout.explorerSidebarSizePct
        : DEFAULT_EXPLORER_CONFIG.explorerSidebarSizePct,
    terminalSizePct: typeof layout.terminalSizePct === 'number' && layout.terminalSizePct > 0
      ? layout.terminalSizePct
      : DEFAULT_EXPLORER_CONFIG.terminalSizePct,
  };
}

interface ExplorerState {
  /** Per-workspace UI state. */
  ui: Record<string, WorkspaceExplorer>;

  /** Get UI state for a workspace (with defaults). */
  get: (workspaceId: string) => WorkspaceExplorer;
  /** Partial-update UI state for a workspace. */
  set: (workspaceId: string, update: Partial<WorkspaceExplorer>) => void;
  /** Hydrate persisted Explorer UI state without writing it back immediately. */
  hydrate: (layout: Record<string, PersistedWorkspaceExplorerLayout> | undefined) => void;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  ui: {},

  get: (workspaceId) => get().ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG,

  set: (workspaceId, update) => {
    set((s) => {
      const current = s.ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG;
      return { ui: { ...s.ui, [workspaceId]: { ...current, ...update } } };
    });
    persistLayout({ explorerLayout: useExplorerStore.getState().ui });
  },

  hydrate: (layout) => {
    const entries = Object.entries(layout ?? {}).map(([workspaceId, value]) => [
      workspaceId,
      normaliseExplorerLayout(value),
    ] as const);
    set({ ui: Object.fromEntries(entries) });
  },
}));

// ── Selector hook ──────────────────────────────────────────────

/** Get ExplorerWorkspace UI state for a workspace (reactive). */
export function useWorkspaceExplorer(workspaceId: string): WorkspaceExplorer {
  return useExplorerStore(
    useShallow((s) => s.ui[workspaceId] ?? DEFAULT_EXPLORER_CONFIG),
  );
}
