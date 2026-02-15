/**
 * Terminal state store — manages terminal tabs and per-workspace
 * CodingWorkspace UI state (sidebar, terminal panel, active panel).
 *
 * Per-workspace UI state lives here so it persists across workspace
 * switches without losing panel visibility, active tab, etc.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CodingPanel } from '@/components/apps/coding/ActivityBar';

export interface TerminalTab {
  id: string;
  workspaceId: string;
  title: string;
  /** Whether the terminal process has exited. */
  exited: boolean;
}

/** Per-workspace UI state for CodingWorkspace. */
export interface WorkspaceCodingUi {
  sidebarOpen: boolean;
  activePanel: CodingPanel;
  terminalOpen: boolean;
}

const DEFAULT_CODING_UI: WorkspaceCodingUi = {
  sidebarOpen: true,
  activePanel: 'explorer',
  terminalOpen: false,
};

interface TerminalState {
  /** All terminal tabs, keyed by terminal ID. */
  tabs: Record<string, TerminalTab>;
  /** Currently active terminal ID per workspace. */
  activeTerminalId: Record<string, string | null>;
  /** Per-workspace CodingWorkspace UI state. */
  codingUi: Record<string, WorkspaceCodingUi>;

  // ── Terminal actions ───────────────────────────────────────

  /** Create a new terminal tab for a workspace. Returns the terminal ID. */
  createTab: (workspaceId: string) => Promise<string>;
  /** Close a terminal tab. */
  closeTab: (terminalId: string) => Promise<void>;
  /** Set the active terminal for a workspace. */
  setActive: (workspaceId: string, terminalId: string | null) => void;
  /** Mark a terminal as exited. */
  markExited: (terminalId: string) => void;
  /** Get all tabs for a workspace. */
  getWorkspaceTabs: (workspaceId: string) => TerminalTab[];

  // ── Per-workspace UI actions ───────────────────────────────

  /** Get CodingWorkspace UI state for a workspace (with defaults). */
  getCodingUi: (workspaceId: string) => WorkspaceCodingUi;
  /** Update CodingWorkspace UI state for a workspace. */
  setCodingUi: (workspaceId: string, update: Partial<WorkspaceCodingUi>) => void;

  /** Subscribe to terminal exit events. Returns cleanup function. */
  initExitListener: () => () => void;
}

let tabCounter = 0;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: {},
  activeTerminalId: {},
  codingUi: {},

  createTab: async (workspaceId) => {
    const terminalId = `term-${workspaceId}-${++tabCounter}-${Date.now()}`;
    const tabNumber = get().getWorkspaceTabs(workspaceId).length + 1;

    const tab: TerminalTab = {
      id: terminalId,
      workspaceId,
      title: `Terminal ${tabNumber}`,
      exited: false,
    };

    set((s) => ({
      tabs: { ...s.tabs, [terminalId]: tab },
      activeTerminalId: { ...s.activeTerminalId, [workspaceId]: terminalId },
    }));

    // Create the PTY in the main process
    try {
      await window.sero.terminal.create(workspaceId, terminalId);
    } catch (err) {
      console.error('[terminal] Failed to create terminal:', err);
      // Remove the tab on failure
      set((s) => {
        const { [terminalId]: _, ...rest } = s.tabs;
        return { tabs: rest };
      });
      throw err;
    }

    return terminalId;
  },

  closeTab: async (terminalId) => {
    const tab = get().tabs[terminalId];
    if (!tab) return;

    try {
      await window.sero.terminal.dispose(terminalId);
    } catch {
      // Terminal may already be disposed
    }

    set((s) => {
      const { [terminalId]: _, ...restTabs } = s.tabs;
      const activeId = s.activeTerminalId[tab.workspaceId];

      // If we closed the active tab, switch to another
      let newActiveId = activeId === terminalId ? null : activeId;
      if (newActiveId === null) {
        const remaining = Object.values(restTabs).filter(
          (t) => t.workspaceId === tab.workspaceId && !t.exited,
        );
        newActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }

      return {
        tabs: restTabs,
        activeTerminalId: { ...s.activeTerminalId, [tab.workspaceId]: newActiveId },
      };
    });
  },

  setActive: (workspaceId, terminalId) =>
    set((s) => ({
      activeTerminalId: { ...s.activeTerminalId, [workspaceId]: terminalId },
    })),

  markExited: (terminalId) =>
    set((s) => {
      const tab = s.tabs[terminalId];
      if (!tab) return s;
      return {
        tabs: { ...s.tabs, [terminalId]: { ...tab, exited: true } },
      };
    }),

  getWorkspaceTabs: (workspaceId) => {
    return Object.values(get().tabs).filter((t) => t.workspaceId === workspaceId);
  },

  // ── Per-workspace UI ─────────────────────────────────────

  getCodingUi: (workspaceId) => {
    return get().codingUi[workspaceId] ?? DEFAULT_CODING_UI;
  },

  setCodingUi: (workspaceId, update) =>
    set((s) => {
      const current = s.codingUi[workspaceId] ?? DEFAULT_CODING_UI;
      return {
        codingUi: { ...s.codingUi, [workspaceId]: { ...current, ...update } },
      };
    }),

  initExitListener: () => {
    const unsubscribe = window.sero.terminal.onExit((terminalId) => {
      get().markExited(terminalId);
    });
    return unsubscribe;
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** Get terminal tabs for a specific workspace. */
export function useWorkspaceTerminals(workspaceId: string): TerminalTab[] {
  return useTerminalStore(
    useShallow((s) =>
      Object.values(s.tabs).filter((t) => t.workspaceId === workspaceId),
    ),
  );
}

/** Get the active terminal ID for a workspace. */
export function useActiveTerminalId(workspaceId: string): string | null {
  return useTerminalStore((s) => s.activeTerminalId[workspaceId] ?? null);
}

/** Get CodingWorkspace UI state for a workspace. */
export function useWorkspaceCodingUi(workspaceId: string): WorkspaceCodingUi {
  return useTerminalStore(
    useShallow((s) => s.codingUi[workspaceId] ?? DEFAULT_CODING_UI),
  );
}
