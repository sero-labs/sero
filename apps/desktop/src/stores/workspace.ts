import { create } from 'zustand';
import type { WorkspaceInfo } from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';

// ── Store ──────────────────────────────────────────────────────

const COLLAPSED_KEY = 'sero:workspace:collapsed';
const ACTIVE_WS_KEY = 'sero:workspace:active';

function loadCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCollapsed(ids: string[]) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
}

interface WorkspaceState {
  /** All registered workspaces. */
  workspaces: WorkspaceInfo[];
  /** IDs of workspaces currently open in the sidebar. */
  openWorkspaceIds: string[];
  /** IDs of workspaces collapsed in the tree view. */
  collapsedIds: string[];
  /** Currently focused workspace (drives sidebar highlight, status bar). */
  activeWorkspaceId: string | null;
  /** Loading state. */
  isLoading: boolean;
  /** Last error message. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────

  /** Load all workspaces from main process. Uses persisted open state. */
  loadWorkspaces: () => Promise<void>;
  /** Add a workspace to the sidebar. */
  openWorkspace: (id: string) => void;
  /** Remove a workspace from the sidebar. */
  closeWorkspace: (id: string) => void;
  /** Toggle collapsed/expanded state of a workspace node. */
  toggleCollapsed: (id: string) => void;
  /** Set the focused workspace. */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace. Optionally specify a parent directory. */
  createWorkspace: (name: string, parentPath?: string) => Promise<WorkspaceInfo>;
  /** Register an existing folder as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string, name?: string) => Promise<WorkspaceInfo>;
  /** Unregister a workspace. */
  removeWorkspace: (id: string) => Promise<void>;
  /** Toggle container mode for a workspace. */
  toggleContainer: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  openWorkspaceIds: [],
  collapsedIds: loadCollapsed(),
  activeWorkspaceId: localStorage.getItem(ACTIVE_WS_KEY) || null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await window.sero.workspace.list();
      const openIds = workspaces.filter((w) => w.open).map((w) => w.id);

      set({
        workspaces,
        openWorkspaceIds: openIds,
        activeWorkspaceId: get().activeWorkspaceId ?? 'global',
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
    if (id === 'global') return; // Can't close global
    set((s) => ({
      openWorkspaceIds: s.openWorkspaceIds.filter((wId) => wId !== id),
      // If we closed the active workspace, fall back to global
      activeWorkspaceId: s.activeWorkspaceId === id ? 'global' : s.activeWorkspaceId,
    }));
    // Sync to main process
    window.sero.workspace.close(id).catch(console.error);
  },

  toggleCollapsed: (id) => {
    set((s) => {
      const collapsed = s.collapsedIds.includes(id)
        ? s.collapsedIds.filter((cid) => cid !== id)
        : [...s.collapsedIds, id];
      saveCollapsed(collapsed);
      return { collapsedIds: collapsed };
    });
  },

  setActiveWorkspace: (id) => {
    if (id) localStorage.setItem(ACTIVE_WS_KEY, id);
    else localStorage.removeItem(ACTIVE_WS_KEY);
    set({ activeWorkspaceId: id });
  },

  createWorkspace: async (name, parentPath) => {
    const workspace = await window.sero.workspace.create(name, parentPath);
    set((s) => ({
      workspaces: [...s.workspaces, workspace],
      openWorkspaceIds: [...s.openWorkspaceIds, workspace.id],
      activeWorkspaceId: workspace.id,
    }));
    // Auto-create and select a default session in the new workspace
    try {
      await useSessionStore.getState().createSession(workspace.id);
    } catch (err) {
      console.warn('Failed to auto-create session for new workspace:', err);
    }
    return workspace;
  },

  addFolder: async (folderPath, name) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, name);
    const isReopen = get().workspaces.some((w) => w.id === workspace.id);
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
    // Auto-create and select a default session for newly imported workspaces
    if (!isReopen) {
      try {
        await useSessionStore.getState().createSession(workspace.id);
      } catch (err) {
        console.warn('Failed to auto-create session for imported workspace:', err);
      }
    }
    return workspace;
  },

  removeWorkspace: async (id) => {
    await window.sero.workspace.remove(id);
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      openWorkspaceIds: s.openWorkspaceIds.filter((wId) => wId !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? 'global' : s.activeWorkspaceId,
    }));
  },

  toggleContainer: async (id) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (!workspace) return;
    const newValue = !workspace.container;
    await window.sero.workspace.setContainer(id, newValue);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, container: newValue } : w,
      ),
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
