/**
 * Container state store — tracks container status per workspace.
 *
 * Listens to agent stream events (container_starting, container_ready,
 * container_error) and container IPC calls to keep state in sync.
 */

import { create } from 'zustand';
import type { ContainerInfo } from '@/types/ipc';

export type ContainerStatus = 'none' | 'starting' | 'running' | 'stopped' | 'error';

export interface WorkspaceContainerState {
  status: ContainerStatus;
  ipAddress?: string;
  error?: string;
}

interface ContainerStoreState {
  /** Container state keyed by workspace ID. */
  containers: Record<string, WorkspaceContainerState>;

  // ── Actions ────────────────────────────────────────────────

  /** Mark a workspace container as starting. */
  setStarting: (workspaceId: string) => void;
  /** Mark a workspace container as running with optional IP. */
  setRunning: (workspaceId: string, ipAddress?: string) => void;
  /** Mark a workspace container as stopped. */
  setStopped: (workspaceId: string) => void;
  /** Mark a workspace container as errored. */
  setError: (workspaceId: string, error: string) => void;
  /** Refresh container state from main process. */
  refresh: (workspaceId: string) => Promise<void>;
}

export const useContainerStore = create<ContainerStoreState>((set) => ({
  containers: {},

  setStarting: (workspaceId) =>
    set((s) => ({
      containers: {
        ...s.containers,
        [workspaceId]: { status: 'starting' },
      },
    })),

  setRunning: (workspaceId, ipAddress) =>
    set((s) => ({
      containers: {
        ...s.containers,
        [workspaceId]: { status: 'running', ipAddress },
      },
    })),

  setStopped: (workspaceId) =>
    set((s) => ({
      containers: {
        ...s.containers,
        [workspaceId]: { status: 'stopped' },
      },
    })),

  setError: (workspaceId, error) =>
    set((s) => ({
      containers: {
        ...s.containers,
        [workspaceId]: { status: 'error', error },
      },
    })),

  refresh: async (workspaceId) => {
    try {
      const info = await window.sero.container.status(workspaceId);
      if (!info) {
        set((s) => ({
          containers: {
            ...s.containers,
            [workspaceId]: { status: 'none' },
          },
        }));
        return;
      }
      set((s) => ({
        containers: {
          ...s.containers,
          [workspaceId]: {
            status: info.state === 'running' ? 'running' : 'stopped',
            ipAddress: info.ipAddress,
          },
        },
      }));
    } catch {
      // Container API not available — leave as-is
    }
  },
}));

// ── Selectors ──────────────────────────────────────────────────

/** Stable default — returned by reference when no container exists. */
const NO_CONTAINER: WorkspaceContainerState = { status: 'none' };

/** Get container state for a specific workspace. */
export function useWorkspaceContainer(workspaceId: string): WorkspaceContainerState {
  return useContainerStore(
    (s) => s.containers[workspaceId] ?? NO_CONTAINER,
  );
}
