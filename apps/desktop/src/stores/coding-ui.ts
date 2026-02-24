/**
 * Per-workspace CodingWorkspace UI state — sidebar, active panel,
 * terminal panel visibility.
 *
 * Separated from terminal store so sidebar concerns don't couple
 * to terminal tab management.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CodingPanel } from '@/components/apps/coding/ActivityBar';

export interface WorkspaceCodingUi {
  sidebarOpen: boolean;
  activePanel: CodingPanel;
  terminalOpen: boolean;
  /** Last expanded size of the coding sidebar (explorer) as percentage. */
  codingSidebarSizePct: number;
  /** Last expanded size of the terminal panel as percentage. */
  terminalSizePct: number;
}

const DEFAULT_CODING_UI: WorkspaceCodingUi = {
  sidebarOpen: true,
  activePanel: 'explorer',
  terminalOpen: false,
  codingSidebarSizePct: 0,
  terminalSizePct: 30,
};

interface CodingUiState {
  /** Per-workspace UI state. */
  ui: Record<string, WorkspaceCodingUi>;

  /** Get UI state for a workspace (with defaults). */
  get: (workspaceId: string) => WorkspaceCodingUi;
  /** Partial-update UI state for a workspace. */
  set: (workspaceId: string, update: Partial<WorkspaceCodingUi>) => void;
}

export const useCodingUiStore = create<CodingUiState>((set, get) => ({
  ui: {},

  get: (workspaceId) => get().ui[workspaceId] ?? DEFAULT_CODING_UI,

  set: (workspaceId, update) =>
    set((s) => {
      const current = s.ui[workspaceId] ?? DEFAULT_CODING_UI;
      return { ui: { ...s.ui, [workspaceId]: { ...current, ...update } } };
    }),
}));

// ── Selector hook ──────────────────────────────────────────────

/** Get CodingWorkspace UI state for a workspace (reactive). */
export function useWorkspaceCodingUi(workspaceId: string): WorkspaceCodingUi {
  return useCodingUiStore(
    useShallow((s) => s.ui[workspaceId] ?? DEFAULT_CODING_UI),
  );
}
