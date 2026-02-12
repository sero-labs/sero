import { create } from 'zustand';
import type { WorkspaceInfo } from '@/types/ipc';

// ── Store ──────────────────────────────────────────────────────

interface WorkspaceState {
  /** All registered workspaces. */
  workspaces: WorkspaceInfo[];
  /** IDs of workspaces currently open in the composite environment. */
  openWorkspaceIds: string[];
  /** Currently focused workspace (drives sidebar highlight, status bar). */
  activeWorkspaceId: string | null;
  /** Loading state. */
  isLoading: boolean;
  /** Last error message. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────

  /** Load all workspaces from main process. Auto-opens workspaces with autoOpen flag. */
  loadWorkspaces: () => Promise<void>;
  /** Add a workspace to the composite environment. */
  openWorkspace: (id: string) => void;
  /** Remove a workspace from the composite environment. */
  closeWorkspace: (id: string) => void;
  /** Set the focused workspace. */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace under ~/.sero-ui/workspaces/. */
  createWorkspace: (name: string) => Promise<WorkspaceInfo>;
  /** Register an existing folder as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string, name?: string) => Promise<WorkspaceInfo>;
  /** Unregister a workspace. */
  removeWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  openWorkspaceIds: [],
  activeWorkspaceId: null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await window.sero.workspace.list();
      // Auto-open workspaces that have the autoOpen flag
      const autoOpenIds = workspaces
        .filter((w) => w.autoOpen)
        .map((w) => w.id);

      set({
        workspaces,
        openWorkspaceIds: autoOpenIds,
        // Default active workspace to scratchpad if nothing is active
        activeWorkspaceId: get().activeWorkspaceId || 'scratchpad',
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workspaces';
      console.error('[workspace] loadWorkspaces failed:', err);
      set({ error: message, isLoading: false });
    }
  },

  openWorkspace: (id) => {
    set((s) => {
      if (s.openWorkspaceIds.includes(id)) return s;
      return { openWorkspaceIds: [...s.openWorkspaceIds, id] };
    });
    // Sync to main process composite environment
    window.sero.workspace.open(id).catch(console.error);
  },

  closeWorkspace: (id) => {
    if (id === 'scratchpad') return; // Can't close scratchpad
    set((s) => ({
      openWorkspaceIds: s.openWorkspaceIds.filter((wId) => wId !== id),
      // If we closed the active workspace, fall back to scratchpad
      activeWorkspaceId: s.activeWorkspaceId === id ? 'scratchpad' : s.activeWorkspaceId,
    }));
    // Sync to main process composite environment
    window.sero.workspace.close(id).catch(console.error);
  },

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  createWorkspace: async (name) => {
    const workspace = await window.sero.workspace.create(name);
    set((s) => ({
      workspaces: [...s.workspaces, workspace],
      openWorkspaceIds: [...s.openWorkspaceIds, workspace.id],
      activeWorkspaceId: workspace.id,
    }));
    return workspace;
  },

  addFolder: async (folderPath, name) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, name);
    set((s) => {
      // Replace if already exists (re-added), otherwise append
      const existing = s.workspaces.findIndex((w) => w.id === workspace.id);
      const workspaces =
        existing >= 0
          ? s.workspaces.map((w, i) => (i === existing ? workspace : w))
          : [...s.workspaces, workspace];

      return {
        workspaces,
        openWorkspaceIds: s.openWorkspaceIds.includes(workspace.id)
          ? s.openWorkspaceIds
          : [...s.openWorkspaceIds, workspace.id],
        activeWorkspaceId: workspace.id,
      };
    });
    return workspace;
  },

  removeWorkspace: async (id) => {
    await window.sero.workspace.remove(id);
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      openWorkspaceIds: s.openWorkspaceIds.filter((wId) => wId !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? 'scratchpad' : s.activeWorkspaceId,
    }));
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** Workspaces currently in the composite environment. */
export function useOpenWorkspaces(): WorkspaceInfo[] {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const openIds = useWorkspaceStore((s) => s.openWorkspaceIds);
  return workspaces.filter((w) => openIds.includes(w.id));
}

/** The currently active/focused workspace. */
export function useActiveWorkspace(): WorkspaceInfo | null {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeId) ?? null;
}
