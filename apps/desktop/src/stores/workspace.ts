import { create } from 'zustand';
import { deriveRepoNameFromGitUrl } from '@sero-ai/common';
import type { WorkspaceInfo } from '@/types/ipc';
import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';
import { useSessionStore } from '@/stores/sessions';
import { persistLayout } from '@/lib/persist-layout';
import { createDebouncedFn } from '@/hooks/useDebouncedCallback';
import { connectOrigin } from '@/components/layout/git-remote/origin-utils';

// ── Store ──────────────────────────────────────────────────────

/** Debounced save of expanded state to main process (avoids excessive disk writes). */
const saveExpandedDebounced = createDebouncedFn(
  (id: string, expanded: boolean) => {
    window.sero.workspace.setExpanded(id, expanded).catch((err) => {
      console.error('[workspace] Failed to persist expanded state:', err);
    });
  },
  300,
);

interface WorkspaceState {
  /** All registered workspaces. Presence in this list = visible in sidebar. */
  workspaces: WorkspaceInfo[];
  /** Currently focused workspace (drives sidebar highlight, status bar). */
  activeWorkspaceId: string | null;
  /** True once the initial workspace list has been loaded from disk. */
  workspacesReady: boolean;
  /** Loading state. */
  isLoading: boolean;
  /** Last error message. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────

  /** Load all workspaces from main process. */
  loadWorkspaces: () => Promise<void>;
  /** Close a workspace — removes it from the registry entirely. */
  closeWorkspace: (id: string) => Promise<void>;
  /** Permanently delete a workspace and erase its folder from disk. Destructive. */
  deleteWorkspace: (id: string) => Promise<void>;
  /** Toggle expanded/collapsed state of a workspace tree node. */
  toggleCollapsed: (id: string) => void;
  /** Collapse all workspace tree nodes. */
  collapseAll: () => void;
  /** Set the focused workspace. */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace. Optionally specify a parent directory. */
  createWorkspace: (name: string, parentPath?: string) => Promise<WorkspaceInfo>;
  /** Register an existing folder as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string, name?: string) => Promise<WorkspaceInfo>;
  /**
   * Create a workspace from a git remote and import its contents (clone).
   * Rolls the empty workspace back out of the registry if the import fails.
   * @param url Any git remote URL (https/ssh). Name is derived from it when omitted.
   */
  cloneWorkspace: (url: string, name?: string, parentPath?: string) => Promise<WorkspaceInfo>;
  /** Set provider-aware runtime backend for a workspace. */
  setRuntimeBackend: (id: string, backend: WorkspaceRuntimeBackend) => Promise<void>;
  /**
   * Toggle container mode for a workspace.
   * @deprecated Use {@link setRuntimeBackend} — boolean container toggling cannot select
   * between docker and apple-container container runtimes.
   */
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
  activeWorkspaceId: null,
  workspacesReady: false,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await window.sero.workspace.list();

      set({
        workspaces,
        activeWorkspaceId: get().activeWorkspaceId ?? 'global',
        isLoading: false,
        workspacesReady: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workspaces';
      console.error('[workspace] loadWorkspaces failed:', err);
      set({ error: message, isLoading: false, workspacesReady: true });
    }
  },

  closeWorkspace: async (id) => {
    if (id === 'global') return; // Can't close global

    try {
      await window.sero.workspace.close(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close workspace';
      console.error('[workspace] closeWorkspace failed:', err);
      set({ error: message });
      return;
    }

    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? 'global' : s.activeWorkspaceId,
    }));
  },

  deleteWorkspace: async (id) => {
    if (id === 'global') return; // Can't delete global

    // Remove from the sidebar immediately. The backend unregisters the workspace
    // before the (potentially slow) file removal, so a deleted workspace must
    // never linger in the tree as a hung entry — the erase finishes in the
    // background.
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? 'global' : s.activeWorkspaceId,
    }));

    try {
      await window.sero.workspace.delete(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workspace';
      console.error('[workspace] deleteWorkspace failed:', err);
      // Reconcile with the true registry — this re-adds the workspace only if it
      // was never actually unregistered — then surface the error.
      await get().loadWorkspaces();
      set({ error: message });
    }
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

  collapseAll: () => {
    set((s) => ({
      workspaces: s.workspaces.map((w) => ({ ...w, open: false })),
    }));
    // Persist each workspace's collapsed state
    for (const w of get().workspaces) {
      window.sero.workspace.setExpanded(w.id, false).catch((err) => {
        console.error('[workspace] Failed to persist collapseAll:', err);
      });
    }
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
    persistLayout({ activeWorkspaceId: id });
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

  cloneWorkspace: async (url, name, parentPath) => {
    const repoName = name?.trim() || deriveRepoNameFromGitUrl(url) || 'repository';
    const previousActiveWorkspaceId = get().activeWorkspaceId;
    const workspace = await window.sero.workspace.create(repoName, parentPath, { requireEmpty: true });
    set((s) => ({
      workspaces: [...s.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    }));

    try {
      const result = await connectOrigin({ workspaceId: workspace.id, url, importMode: 'auto' });
      if (!result.ok) throw new Error(result.message);
      if (!result.import.imported) {
        throw new Error(
          result.import.reason === 'workspace-not-empty'
            ? 'Clone destination is not empty'
            : result.import.message ?? 'Failed to import repository',
        );
      }
    } catch (error) {
      const restorePreviousSelection = get().activeWorkspaceId === workspace.id;
      await get().closeWorkspace(workspace.id);
      if (restorePreviousSelection) set({ activeWorkspaceId: previousActiveWorkspaceId });
      throw error;
    }

    // Auto-create and select a default session in the cloned workspace.
    try {
      await useSessionStore.getState().createSession(workspace.id);
    } catch (err) {
      console.warn('Failed to auto-create session for cloned workspace:', err);
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

  setRuntimeBackend: async (id, backend) => {
    const updated = await window.sero.workspace.setRuntimeBackend(id, backend);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)),
    }));
  },

  toggleContainer: async (id) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (!workspace) return;
    const nextBackend: WorkspaceRuntimeBackend = workspace.runtime.backend === 'host'
      ? 'docker'
      : 'host';
    await get().setRuntimeBackend(id, nextBackend);
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

// ── Startup helper ─────────────────────────────────────────────

/**
 * Load the workspace list from the main process.
 * Called once from App.tsx during startup. Workspace-scoped apps read
 * `workspacesReady` so they can stay in a loading state until this finishes.
 */
export async function loadWorkspaces(): Promise<void> {
  return useWorkspaceStore.getState().loadWorkspaces();
}

// ── Selectors ──────────────────────────────────────────────────

/** All registered workspaces (presence = visible in sidebar). */
export function useOpenWorkspaces(): WorkspaceInfo[] {
  return useWorkspaceStore((s) => s.workspaces);
}

/** The currently active/focused workspace. */
export function useActiveWorkspace(): WorkspaceInfo | null {
  return useWorkspaceStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null,
  );
}
