import { create } from 'zustand';

import type {
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  CommitEntry,
  GitAppState,
  WorkingCopyStatus,
  Branch,
  Remote,
  FileDiffEntry,
} from '@sero-ai/common';
import {
  adaptBranches,
  adaptRemotes,
  adaptWorkingCopyStatus,
  deriveHeadLog,
  getGitStateFilePath,
  mergePagedLog,
  normalizeGitAppState,
} from '@/lib/git-state';

// ── Per-workspace VCS data ───────────────────────────────────

interface WorkspaceVcsData extends VcsWorkspaceState {
  // Rich state
  logEntries: CommitEntry[];
  wcStatus: WorkingCopyStatus | null;
  branches: Branch[];
  activePushBranch: string | null;
  /** True once the user (or initial load) has set activePushBranch. */
  activePushBranchInitialized: boolean;
  remotes: Remote[];
  // Diff state
  lastDiff: string | null;
  lastDiffFiles: FileDiffEntry[];
  // UI
  isLoading: boolean;
  error: string | null;
  logPage: number;
  logHasMore: boolean;
}

interface VcsStore {
  byWorkspace: Record<string, WorkspaceVcsData>;
  listening: boolean;

  // Lifecycle
  initEventListener: () => () => void;

  // Unified repo state (pushed .sero/apps/git/state.json cache)
  subscribeGitState: (wsId: string, workspacePath: string) => () => void;

  // Data loading (checkpoints + deep-history overflow)
  loadWorkspace: (wsId: string) => Promise<void>;
  loadMoreLog: (wsId: string) => Promise<void>;
  refreshAll: (wsId: string) => Promise<void>;

  // Mutations
  createCheckpoint: (wsId: string, desc?: string, src?: VcsCheckpoint['source']) => Promise<void>;
  restoreCheckpoint: (wsId: string, id: string) => Promise<void>;
  amendMessage: (wsId: string, sha: string, msg: string) => Promise<void>;
  createBranch: (wsId: string, name: string, rev?: string) => Promise<void>;
  deleteBranch: (wsId: string, name: string) => Promise<void>;
  moveBranch: (wsId: string, name: string, toRev: string) => Promise<void>;
  setActivePushBranch: (wsId: string, name: string | null) => void;
  addRemote: (wsId: string, name: string, url: string) => Promise<void>;
  removeRemote: (wsId: string, name: string) => Promise<void>;
  fetch: (wsId: string, remote?: string) => Promise<{ success: boolean; message: string }>;
  push: (wsId: string, bm?: string, cId?: string) => Promise<{ success: boolean; message: string }>;
  undo: (wsId: string) => Promise<void>;
  discardCommit: (wsId: string, sha: string) => Promise<void>;

  // Diff
  fetchDiff: (wsId: string, from: string, to?: string) => Promise<string>;
  fetchDiffFiles: (wsId: string, from: string, to?: string) => Promise<FileDiffEntry[]>;

  // Errors
  setError: (wsId: string, error: string | null) => void;
}

const PAGE_SIZE = 40;

interface GitStateSubscription {
  filePath: string;
  refCount: number;
}

const gitStateSubs = new Map<string, GitStateSubscription>();
const wsIdByFilePath = new Map<string, string>();
let appStateListenerStarted = false;

function emptyWs(wsId: string): WorkspaceVcsData {
  return {
    workspaceId: wsId,
    currentSha: null,
    hasWorkingCopyChanges: false,
    checkpoints: [],
    logEntries: [],
    wcStatus: null,
    branches: [],
    activePushBranch: null,
    activePushBranchInitialized: false,
    remotes: [],
    lastDiff: null,
    lastDiffFiles: [],
    isLoading: false,
    error: null,
    logPage: 0,
    logHasMore: true,
  };
}

function getWs(state: Pick<VcsStore, 'byWorkspace'>, wsId: string): WorkspaceVcsData {
  return state.byWorkspace[wsId] ?? emptyWs(wsId);
}

function updateWs(
  set: (fn: (s: VcsStore) => Partial<VcsStore>) => void,
  wsId: string,
  patch: Partial<WorkspaceVcsData>,
): void {
  set((s) => {
    const existing = getWs(s, wsId);
    return { byWorkspace: { ...s.byWorkspace, [wsId]: { ...existing, ...patch } } };
  });
}

export const useVcsStore = create<VcsStore>((set, get) => ({
  byWorkspace: {},
  listening: false,

  initEventListener: () => {
    if (get().listening) return () => {};
    set({ listening: true });

    const unsub = window.sero.vcs.onEvent((event: VcsEvent) => {
      const wsId = event.workspaceId;
      switch (event.type) {
        case 'checkpoint_created': {
          const ws = getWs(get(), wsId);
          const cps = [event.checkpoint, ...ws.checkpoints]
            .filter((cp, i, arr) => arr.findIndex((x) => x.sha === cp.sha) === i)
            .slice(0, 80);
          updateWs(set, wsId, { checkpoints: cps, hasWorkingCopyChanges: false, error: null });
          // Repo state (log/status/branches) arrives via the pushed state file
          break;
        }
        case 'restored':
          void get().refreshAll(wsId);
          break;
        case 'refreshed':
          void get().refreshAll(wsId);
          break;
        case 'error':
          updateWs(set, wsId, { error: event.error });
          break;
      }
    });

    return () => { unsub(); set({ listening: false }); };
  },

  subscribeGitState: (wsId, workspacePath) => {
    const filePath = getGitStateFilePath(workspacePath);

    if (!appStateListenerStarted) {
      appStateListenerStarted = true;
      window.sero.appState.onChange((changedPath: string, data: unknown) => {
        const targetWsId = wsIdByFilePath.get(changedPath);
        if (targetWsId) applyGitAppState(set, get, targetWsId, data);
      });
    }

    const existing = gitStateSubs.get(wsId);
    if (existing) {
      existing.refCount += 1;
    } else {
      gitStateSubs.set(wsId, { filePath, refCount: 1 });
      wsIdByFilePath.set(filePath, wsId);
      void window.sero.appState.watch(filePath).then((data: unknown) => {
        if (data !== undefined && data !== null) applyGitAppState(set, get, wsId, data);
      });
    }

    return () => {
      const sub = gitStateSubs.get(wsId);
      if (!sub) return;
      sub.refCount -= 1;
      if (sub.refCount > 0) return;
      gitStateSubs.delete(wsId);
      wsIdByFilePath.delete(sub.filePath);
      void window.sero.appState.unwatch(sub.filePath);
    };
  },

  loadWorkspace: async (wsId) => {
    updateWs(set, wsId, { isLoading: true, error: null });
    try {
      const state = await window.sero.vcs.getState(wsId, 60);
      updateWs(set, wsId, { ...state, isLoading: false, error: null });
    } catch (err) {
      updateWs(set, wsId, { isLoading: false, error: errMsg(err) });
    }
  },

  loadMoreLog: async (wsId) => {
    const ws = getWs(get(), wsId);
    try {
      const nextLimit = (ws.logPage + 2) * PAGE_SIZE;
      const entries = await window.sero.vcs.logEntries(wsId, nextLimit);
      updateWs(set, wsId, {
        logEntries: entries,
        logPage: ws.logPage + 1,
        logHasMore: entries.length >= nextLimit,
      });
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  refreshAll: async (wsId) => {
    // Checkpoint state is IPC; repo state arrives via the pushed state file —
    // force a re-derive so explicit refreshes work even when the workspace
    // watcher runs in manual mode or missed an event.
    await Promise.all([
      get().loadWorkspace(wsId),
      window.sero.vcs.refreshState(wsId),
    ]);
  },


  createCheckpoint: async (wsId, desc, src = 'manual') => {
    try {
      await window.sero.vcs.createCheckpoint(wsId, desc, src);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  restoreCheckpoint: async (wsId, id) => {
    try {
      await window.sero.vcs.restore(wsId, id);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
      throw err;
    }
  },

  amendMessage: async (wsId, sha, msg) => {
    await window.sero.vcs.amendMessage(wsId, sha, msg);
  },

  createBranch: async (wsId, name, rev) => {
    await window.sero.vcs.createBranch(wsId, name, rev);
  },

  deleteBranch: async (wsId, name) => {
    await window.sero.vcs.deleteBranch(wsId, name);
  },

  moveBranch: async (wsId, name, toRev) => {
    await window.sero.vcs.moveBranch(wsId, name, toRev);
  },

  setActivePushBranch: (wsId, name) => {
    const ws = getWs(get(), wsId);
    if (name && !ws.branches.some((b) => b.name === name)) return;
    updateWs(set, wsId, { activePushBranch: name, activePushBranchInitialized: true });
  },

  addRemote: async (wsId, name, url) => {
    await window.sero.vcs.addRemote(wsId, name, url);
  },

  removeRemote: async (wsId, name) => {
    await window.sero.vcs.removeRemote(wsId, name);
  },

  fetch: async (wsId, remote) => {
    const result = await window.sero.vcs.fetch(wsId, remote);
    await get().refreshAll(wsId);
    return result;
  },

  push: async (wsId, bm, cId) => {
    const result = await window.sero.vcs.push(wsId, bm, cId);
    updateWs(set, wsId, { error: result.success ? null : result.message });
    return result;
  },

  undo: async (wsId) => {
    await window.sero.vcs.undo(wsId);
    await get().refreshAll(wsId);
  },

  discardCommit: async (wsId, sha) => {
    await window.sero.vcs.discardCommit(wsId, sha);
    await get().refreshAll(wsId);
  },

  fetchDiff: async (wsId, from, to) => {
    const diff = await window.sero.vcs.diff(wsId, from, to);
    updateWs(set, wsId, { lastDiff: diff, error: null });
    return diff;
  },

  fetchDiffFiles: async (wsId, from, to) => {
    const files = await window.sero.vcs.fileDiffSummary(wsId, from, to);
    updateWs(set, wsId, { lastDiffFiles: files });
    return files;
  },

  setError: (wsId, error) => updateWs(set, wsId, { error }),
}));

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown VCS error';
}


function applyGitAppState(
  set: (fn: (s: VcsStore) => Partial<VcsStore>) => void,
  get: () => VcsStore,
  wsId: string,
  data: unknown,
): void {
  const state: GitAppState = normalizeGitAppState(data);
  const ws = getWs(get(), wsId);

  const branches = adaptBranches(state);
  let activePushBranch = ws.activePushBranch;
  if (activePushBranch && !branches.some((b) => b.name === activePushBranch)) {
    activePushBranch = null;
  }
  // Only auto-select on first initialization, not on every update
  if (!ws.activePushBranchInitialized && activePushBranch === null && branches.length > 0) {
    activePushBranch = branches.find((b) => b.name === 'main')?.name ?? branches[0]?.name ?? null;
  }

  // While the user is paging deep history via IPC, keep the paged depth but
  // replace the cache-covered prefix so new commits still appear.
  const derivedLog = deriveHeadLog(state, (ws.logPage + 1) * PAGE_SIZE);
  const logEntries = ws.logPage > 0 && ws.logEntries.length > derivedLog.length
    ? mergePagedLog(derivedLog, ws.logEntries)
    : derivedLog;

  updateWs(set, wsId, {
    branches,
    activePushBranch,
    activePushBranchInitialized: ws.activePushBranchInitialized || branches.length > 0,
    remotes: adaptRemotes(state),
    wcStatus: adaptWorkingCopyStatus(state),
    currentSha: state.headHash || null,
    hasWorkingCopyChanges: state.fileChanges.length > 0,
    logEntries,
    logHasMore: state.commitCount > logEntries.length,
    error: state.error ?? null,
  });
}

export function useWorkspaceVcs(wsId: string | null | undefined): WorkspaceVcsData | null {
  return useVcsStore((s) => (wsId ? s.byWorkspace[wsId] ?? null : null));
}
