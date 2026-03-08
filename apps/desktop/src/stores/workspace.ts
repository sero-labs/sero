import { create } from 'zustand';
import type { WorkspaceInfo } from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';

// ── Store ──────────────────────────────────────────────────────

const ACTIVE_WS_KEY = 'sero:workspace:active';

/** Debounced save of expanded state to main process (avoids excessive disk writes). */
let expandedSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveExpandedDebounced(id: string, expanded: boolean) {
  if (expandedSaveTimer) clearTimeout(expandedSaveTimer);
  expandedSaveTimer = setTimeout(() => {
    window.sero.workspace.setExpanded(id, expanded).catch((err) => {
      console.error('[workspace] Failed to persist expanded state:', err);
    });
  }, 300);
}

interface WorkspaceState {
  /** All registered workspaces. Presence in this list = visible in sidebar. */
  workspaces: WorkspaceInfo[];
  /** Currently focused workspace (drives sidebar highlight, status bar). */
  activeWorkspaceId: string | null;
  /** Loading state. */
  isLoading: boolean;
  /** Last error message. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────

  /** Load all workspaces from main process. */
  loadWorkspaces: () => Promise<void>;
  /** Close a workspace — removes it from the registry entirely. */
  closeWorkspace: (id: string) => void;
  /** Toggle expanded/collapsed state of a workspace tree node. */
  toggleCollapsed: (id: string) => void;
  /** Set the focused workspace. */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace. Optionally specify a parent directory. */
  createWorkspace: (name: string, parentPath?: string) => Promise<WorkspaceInfo>;
  /** Register an existing folder as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string, name?: string) => Promise<WorkspaceInfo>;
  /** Toggle container mode for a workspace. */
  toggleContainer: (id: string) => Promise<void>;
  /** Add a workspace reference. Mounts the referenced workspace into the container. */
  addReference: (id: string, refId: string) => Promise<void>;
  /** Remove a workspace reference. */
  removeReference: (id: string, refId: string) => Promise<void>;
  /** Mount an arbitrary host folder into this workspace's container. */
  addMount: (id: string, folderPath: string) => Promise<void>;
  /** Remove an arbitrary folder mount. */
  removeMount: (id: string, folderPath: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: localStorage.getItem(ACTIVE_WS_KEY) || null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await window.sero.workspace.list();

      // One-time migration: clean up legacy localStorage keys
      localStorage.removeItem('sero:workspace:collapsed');

      set({
        workspaces,
        activeWorkspaceId: get().activeWorkspaceId ?? 'global',
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workspaces';
      console.error('[workspace] loadWorkspaces failed:', err);
      set({ error: message, isLoading: false });
    }
  },

  closeWorkspace: (id) => {
    if (id === 'global') return; // Can't close global
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? 'global' : s.activeWorkspaceId,
    }));
    // Remove from registry on disk
    window.sero.workspace.close(id).catch(console.error);
  },

  toggleCollapsed: (id) => {
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, open: !w.open } : w,
      ),
    }));
    const workspace = get().workspaces.find((w) => w.id === id);
    if (workspace) {
      saveExpandedDebounced(id, workspace.open);
    }
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

  addReference: async (id, refId) => {
    await window.sero.workspace.addReference(id, refId);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id && !w.references.includes(refId)
          ? { ...w, references: [...w.references, refId] }
          : w,
      ),
    }));
  },

  removeReference: async (id, refId) => {
    await window.sero.workspace.removeReference(id, refId);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id
          ? { ...w, references: w.references.filter((r) => r !== refId) }
          : w,
      ),
    }));
  },

  addMount: async (id, folderPath) => {
    await window.sero.workspace.addMount(id, folderPath);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id && !w.mounts.includes(folderPath)
          ? { ...w, mounts: [...w.mounts, folderPath] }
          : w,
      ),
    }));
  },

  removeMount: async (id, folderPath) => {
    await window.sero.workspace.removeMount(id, folderPath);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id
          ? { ...w, mounts: w.mounts.filter((m) => m !== folderPath) }
          : w,
      ),
    }));
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** All registered workspaces (presence = visible in sidebar). */
export function useOpenWorkspaces(): WorkspaceInfo[] {
  return useWorkspaceStore((s) => s.workspaces);
}

/** The currently active/focused workspace. */
export function useActiveWorkspace(): WorkspaceInfo | null {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeId) ?? null;
}
