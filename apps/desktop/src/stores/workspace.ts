import { create } from 'zustand';
import {
  OPENSHELL_POLICY_PROFILE_HISTORY_LIMIT,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';
import type {
  OpenShellRemoteGatewayEntry,
  OpenShellRemoteGatewayInput,
  OpenShellRemoteGatewayTestResult,
  WorkspaceInfo,
  WorkspaceRuntimeConfig,
} from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';
import { persistLayout } from '@/lib/persist-layout';
import { createDebouncedFn } from '@/hooks/useDebouncedCallback';

function isAppleContainerEnabled(workspace: WorkspaceInfo): boolean {
  if (workspace.runtime?.providerId === 'apple-container') return true;
  if (workspace.runtime?.providerId === 'host') return false;
  if (workspace.runtime?.providerId === 'openshell-local' || workspace.runtime?.providerId === 'openshell-remote') return false;
  return workspace.container;
}

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
  /** Cached OpenShell Remote gateway registry entries. */
  openShellRemoteGateways: OpenShellRemoteGatewayEntry[];

  // ── Actions ────────────────────────────────────────────────

  /** Load all workspaces from main process. */
  loadWorkspaces: () => Promise<void>;
  /** Close a workspace — removes it from the registry entirely. */
  closeWorkspace: (id: string) => Promise<void>;
  /** Toggle expanded/collapsed state of a workspace tree node. */
  toggleCollapsed: (id: string) => void;
  /** Collapse all workspace tree nodes. */
  collapseAll: () => void;
  /** Set the focused workspace. */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace. Optionally specify a parent directory. */
  createWorkspace: (
    name: string,
    parentPath?: string,
    runtime?: WorkspaceRuntimeConfig,
  ) => Promise<WorkspaceInfo>;
  /** Register an existing folder as a workspace (VSCode "Add Folder"). */
  addFolder: (folderPath: string, name?: string) => Promise<WorkspaceInfo>;
  /** Toggle container mode for a workspace. */
  toggleContainer: (id: string) => Promise<void>;
  /** Set provider-aware runtime config for a workspace. */
  setRuntime: (id: string, runtime: WorkspaceRuntimeConfig | undefined) => Promise<void>;
  /** Persist an OpenShell policy profile selection for an existing workspace. */
  setOpenShellPolicyProfile: (id: string, profileId: OpenShellPolicyProfileId) => Promise<void>;
  loadOpenShellRemoteGateways: () => Promise<OpenShellRemoteGatewayEntry[]>;
  saveOpenShellRemoteGateway: (
    entry: OpenShellRemoteGatewayInput,
  ) => Promise<OpenShellRemoteGatewayEntry>;
  removeOpenShellRemoteGateway: (id: string) => Promise<void>;
  testOpenShellRemoteGateway: (
    entry: OpenShellRemoteGatewayInput,
  ) => Promise<OpenShellRemoteGatewayTestResult>;
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
  openShellRemoteGateways: [],

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

  createWorkspace: async (name, parentPath, runtime) => {
    const workspace = await window.sero.workspace.create(name, parentPath, runtime);
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
    const newValue = !isAppleContainerEnabled(workspace);
    const runtime: WorkspaceRuntimeConfig = {
      providerId: newValue ? 'apple-container' : 'host',
    };
    await window.sero.workspace.setContainer(id, newValue);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, container: newValue, runtime } : w,
      ),
    }));
  },

  setRuntime: async (id, runtime) => {
    await window.sero.workspace.setRuntime(id, runtime);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id
          ? { ...w, runtime, container: runtime ? runtime.providerId === 'apple-container' : w.container }
          : w,
      ),
    }));
  },

  setOpenShellPolicyProfile: async (id, profileId) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (workspace?.runtime?.providerId !== 'openshell-local') return;
    if (workspace.runtime.policyProfileId === profileId) return;

    const changedAt = new Date().toISOString();
    const runtime: WorkspaceRuntimeConfig = {
      ...workspace.runtime,
      policyProfileId: profileId,
      policyProfileUpdatedAt: changedAt,
      policyProfileHistory: [
        ...(workspace.runtime.policyProfileHistory ?? []),
        {
          profileId,
          changedAt,
          message: 'Selected from existing workspace policy menu',
        },
      ].slice(-OPENSHELL_POLICY_PROFILE_HISTORY_LIMIT),
    };

    await get().setRuntime(id, runtime);
  },

  loadOpenShellRemoteGateways: async () => {
    const gateways = await window.sero.workspace.listOpenShellRemoteGateways();
    set({ openShellRemoteGateways: gateways });
    return gateways;
  },

  saveOpenShellRemoteGateway: async (entry) => {
    const gateway = await window.sero.workspace.saveOpenShellRemoteGateway(entry);
    set((s) => ({
      openShellRemoteGateways: s.openShellRemoteGateways.some((item) => item.id === gateway.id)
        ? s.openShellRemoteGateways.map((item) => (item.id === gateway.id ? gateway : item))
        : [...s.openShellRemoteGateways, gateway],
    }));
    return gateway;
  },

  removeOpenShellRemoteGateway: async (id) => {
    await window.sero.workspace.removeOpenShellRemoteGateway(id);
    set((s) => ({
      openShellRemoteGateways: s.openShellRemoteGateways.filter((gateway) => gateway.id !== id),
    }));
  },

  testOpenShellRemoteGateway: async (entry) => {
    return window.sero.workspace.testOpenShellRemoteGateway(entry);
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
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeId) ?? null;
}
