import { create } from 'zustand';

import type { VcsCheckpoint, VcsEvent, VcsWorkspaceState } from '@/types/vcs';

interface WorkspaceVcsData extends VcsWorkspaceState {
  lastDiff: string | null;
  isLoading: boolean;
  error: string | null;
}

interface VcsStore {
  byWorkspace: Record<string, WorkspaceVcsData>;
  listening: boolean;
  initEventListener: () => () => void;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  watchWorkspace: (workspaceId: string) => Promise<void>;
  unwatchWorkspace: (workspaceId: string) => Promise<void>;
  createCheckpoint: (workspaceId: string, description?: string, source?: VcsCheckpoint['source']) => Promise<void>;
  restoreCheckpoint: (workspaceId: string, checkpointId: string) => Promise<void>;
  fetchDiff: (workspaceId: string, fromChangeId: string, toChangeId?: string) => Promise<string>;
}

function emptyWorkspace(workspaceId: string): WorkspaceVcsData {
  return {
    workspaceId,
    currentChangeId: null,
    hasWorkingCopyChanges: false,
    checkpoints: [],
    lastDiff: null,
    isLoading: false,
    error: null,
  };
}

function ensureWorkspace(
  state: Pick<VcsStore, 'byWorkspace'>,
  workspaceId: string,
): WorkspaceVcsData {
  return state.byWorkspace[workspaceId] ?? emptyWorkspace(workspaceId);
}

export const useVcsStore = create<VcsStore>((set, get) => ({
  byWorkspace: {},
  listening: false,

  initEventListener: () => {
    if (get().listening) {
      return () => {};
    }

    set({ listening: true });

    const unsubscribe = window.sero.vcs.onEvent((event: VcsEvent) => {
      switch (event.type) {
        case 'checkpoint_created':
          set((s) => {
            const existing = ensureWorkspace(s, event.workspaceId);
            const checkpoints = [event.checkpoint, ...existing.checkpoints]
              .filter((cp, index, arr) => arr.findIndex((x) => x.changeId === cp.changeId) === index)
              .slice(0, 80);

            return {
              byWorkspace: {
                ...s.byWorkspace,
                [event.workspaceId]: {
                  ...existing,
                  checkpoints,
                  currentChangeId: existing.currentChangeId,
                  hasWorkingCopyChanges: false,
                  error: null,
                },
              },
            };
          });
          break;

        case 'restored':
          void get().loadWorkspace(event.workspaceId);
          break;

        case 'error':
          set((s) => {
            const existing = ensureWorkspace(s, event.workspaceId);
            return {
              byWorkspace: {
                ...s.byWorkspace,
                [event.workspaceId]: {
                  ...existing,
                  error: event.error,
                },
              },
            };
          });
          break;
      }
    });

    return () => {
      unsubscribe();
      set({ listening: false });
    };
  },

  loadWorkspace: async (workspaceId: string) => {
    set((s) => {
      const existing = ensureWorkspace(s, workspaceId);
      return {
        byWorkspace: {
          ...s.byWorkspace,
          [workspaceId]: {
            ...existing,
            isLoading: true,
            error: null,
          },
        },
      };
    });

    try {
      const state = await window.sero.vcs.getState(workspaceId, 60);
      set((s) => {
        const existing = ensureWorkspace(s, workspaceId);
        return {
          byWorkspace: {
            ...s.byWorkspace,
            [workspaceId]: {
              ...existing,
              ...state,
              isLoading: false,
              error: null,
            },
          },
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load checkpoint state';
      set((s) => {
        const existing = ensureWorkspace(s, workspaceId);
        return {
          byWorkspace: {
            ...s.byWorkspace,
            [workspaceId]: {
              ...existing,
              isLoading: false,
              error: message,
            },
          },
        };
      });
    }
  },

  watchWorkspace: async (workspaceId: string) => {
    await window.sero.vcs.watch(workspaceId);
  },

  unwatchWorkspace: async (workspaceId: string) => {
    await window.sero.vcs.unwatch(workspaceId);
  },

  createCheckpoint: async (workspaceId: string, description?: string, source: VcsCheckpoint['source'] = 'manual') => {
    try {
      await window.sero.vcs.createCheckpoint(workspaceId, description, source);
      await get().loadWorkspace(workspaceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create checkpoint';
      set((s) => {
        const existing = ensureWorkspace(s, workspaceId);
        return {
          byWorkspace: {
            ...s.byWorkspace,
            [workspaceId]: { ...existing, error: message },
          },
        };
      });
    }
  },

  restoreCheckpoint: async (workspaceId: string, checkpointId: string) => {
    try {
      await window.sero.vcs.restore(workspaceId, checkpointId);
      await get().loadWorkspace(workspaceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore checkpoint';
      set((s) => {
        const existing = ensureWorkspace(s, workspaceId);
        return {
          byWorkspace: {
            ...s.byWorkspace,
            [workspaceId]: { ...existing, error: message },
          },
        };
      });
      throw err;
    }
  },

  fetchDiff: async (workspaceId: string, fromChangeId: string, toChangeId?: string) => {
    const diff = await window.sero.vcs.diff(workspaceId, fromChangeId, toChangeId);

    set((s) => {
      const existing = ensureWorkspace(s, workspaceId);
      return {
        byWorkspace: {
          ...s.byWorkspace,
          [workspaceId]: {
            ...existing,
            lastDiff: diff,
            error: null,
          },
        },
      };
    });

    return diff;
  },
}));

export function useWorkspaceVcs(workspaceId: string | null | undefined): WorkspaceVcsData | null {
  return useVcsStore((s) => {
    if (!workspaceId) return null;
    return s.byWorkspace[workspaceId] ?? null;
  });
}
