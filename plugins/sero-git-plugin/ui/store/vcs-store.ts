/**
 * The renderer-side repo cache — owned by this plugin (AD-025).
 *
 * One state path: every git surface reads this store, and the store calls
 * `window.sero.vcs` directly. Repo state arrives by push (the workspace's
 * `.sero/apps/git/state.json`, watched with a ref-counted subscription);
 * checkpoints and deep history come over IPC.
 *
 * There is deliberately no `activePushBranch` here. Push pushes the current
 * branch, and the branch rail is where you change branch.
 */

import { create } from 'zustand';
import {
  adaptBranches,
  adaptRemotes,
  adaptWorkingCopyStatus,
  deriveHeadLog,
  getGitStateFilePath,
  mergePagedLog,
  normalizeGitAppState,
} from './git-state';
import { seroBridge } from './sero-bridge';
import type {
  Branch,
  CommitEntry,
  FileDiffEntry,
  Remote,
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  WorkingCopyStatus,
} from './sero-bridge';
import type { GitAppState } from '@sero-ai/common';

export interface WorkspaceVcsData extends VcsWorkspaceState {
  /** Repository root. Usually the workspace root, but not always. */
  repoPath: string;
  logEntries: CommitEntry[];
  wcStatus: WorkingCopyStatus | null;
  branches: Branch[];
  remotes: Remote[];
  lastDiff: string | null;
  lastDiffFiles: FileDiffEntry[];
  isLoading: boolean;
  error: string | null;
  logPage: number;
  logHasMore: boolean;
}

interface VcsStore {
  byWorkspace: Record<string, WorkspaceVcsData>;
  listening: boolean;

  initEventListener: () => () => void;
  subscribeGitState: (wsId: string, workspacePath: string) => () => void;

  loadWorkspace: (wsId: string) => Promise<void>;
  loadMoreLog: (wsId: string) => Promise<void>;
  refreshAll: (wsId: string) => Promise<void>;

  createCheckpoint: (wsId: string, desc?: string, src?: VcsCheckpoint['source']) => Promise<void>;
  restoreCheckpoint: (wsId: string, id: string) => Promise<void>;
  amendMessage: (wsId: string, sha: string, msg: string) => Promise<void>;
  createBranch: (wsId: string, name: string, rev?: string) => Promise<void>;
  deleteBranch: (wsId: string, name: string) => Promise<void>;
  moveBranch: (wsId: string, name: string, toRev: string) => Promise<void>;
  addRemote: (wsId: string, name: string, url: string) => Promise<void>;
  removeRemote: (wsId: string, name: string) => Promise<void>;
  fetch: (wsId: string, remote?: string) => Promise<{ success: boolean; message: string }>;
  push: (wsId: string, branch?: string, cId?: string) => Promise<{ success: boolean; message: string }>;
  undo: (wsId: string) => Promise<void>;
  discardCommit: (wsId: string, sha: string) => Promise<void>;

  fetchDiff: (wsId: string, from: string, to?: string) => Promise<string>;
  fetchDiffFiles: (wsId: string, from: string, to?: string) => Promise<FileDiffEntry[]>;

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
    repoPath: '',
    currentSha: null,
    hasWorkingCopyChanges: false,
    checkpoints: [],
    logEntries: [],
    wcStatus: null,
    branches: [],
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

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown git error';
}

export const useVcsStore = create<VcsStore>((set, get) => ({
  byWorkspace: {},
  listening: false,

  initEventListener: () => {
    if (get().listening) return () => {};
    set({ listening: true });

    const unsub = seroBridge().vcs.onEvent((event: VcsEvent) => {
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
    const { appState } = seroBridge();

    if (!appStateListenerStarted) {
      appStateListenerStarted = true;
      appState.onChange((changedPath: string, data: unknown) => {
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
      void appState.watch(filePath).then((data: unknown) => {
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
      void appState.unwatch(sub.filePath);
    };
  },

  loadWorkspace: async (wsId) => {
    updateWs(set, wsId, { isLoading: true, error: null });
    try {
      const state = await seroBridge().vcs.getState(wsId, 60);
      updateWs(set, wsId, { ...state, isLoading: false, error: null });
    } catch (err) {
      updateWs(set, wsId, { isLoading: false, error: errMsg(err) });
    }
  },

  loadMoreLog: async (wsId) => {
    const ws = getWs(get(), wsId);
    try {
      const nextLimit = (ws.logPage + 2) * PAGE_SIZE;
      const entries = await seroBridge().vcs.logEntries(wsId, nextLimit);
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
      seroBridge().vcs.refreshState(wsId),
    ]);
  },

  createCheckpoint: async (wsId, desc, src = 'manual') => {
    try {
      await seroBridge().vcs.createCheckpoint(wsId, desc, src);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
    }
  },

  restoreCheckpoint: async (wsId, id) => {
    try {
      await seroBridge().vcs.restore(wsId, id);
      await get().refreshAll(wsId);
    } catch (err) {
      updateWs(set, wsId, { error: errMsg(err) });
      throw err;
    }
  },

  amendMessage: async (wsId, sha, msg) => {
    await seroBridge().vcs.amendMessage(wsId, sha, msg);
  },

  createBranch: async (wsId, name, rev) => {
    await seroBridge().vcs.createBranch(wsId, name, rev);
    await get().refreshAll(wsId);
  },

  deleteBranch: async (wsId, name) => {
    await seroBridge().vcs.deleteBranch(wsId, name);
    await get().refreshAll(wsId);
  },

  moveBranch: async (wsId, name, toRev) => {
    await seroBridge().vcs.moveBranch(wsId, name, toRev);
    await get().refreshAll(wsId);
  },

  addRemote: async (wsId, name, url) => {
    await seroBridge().vcs.addRemote(wsId, name, url);
    await get().refreshAll(wsId);
  },

  removeRemote: async (wsId, name) => {
    await seroBridge().vcs.removeRemote(wsId, name);
    await get().refreshAll(wsId);
  },

  fetch: async (wsId, remote) => {
    const result = await seroBridge().vcs.fetch(wsId, remote);
    updateWs(set, wsId, { error: result.success ? null : result.message });
    await get().refreshAll(wsId);
    return result;
  },

  push: async (wsId, branch, cId) => {
    const result = await seroBridge().vcs.push(wsId, branch, cId);
    updateWs(set, wsId, { error: result.success ? null : result.message });
    return result;
  },

  undo: async (wsId) => {
    await seroBridge().vcs.undo(wsId);
    await get().refreshAll(wsId);
  },

  discardCommit: async (wsId, sha) => {
    await seroBridge().vcs.discardCommit(wsId, sha);
    await get().refreshAll(wsId);
  },

  fetchDiff: async (wsId, from, to) => {
    const diff = await seroBridge().vcs.diff(wsId, from, to);
    updateWs(set, wsId, { lastDiff: diff, error: null });
    return diff;
  },

  fetchDiffFiles: async (wsId, from, to) => {
    const files = await seroBridge().vcs.fileDiffSummary(wsId, from, to);
    updateWs(set, wsId, { lastDiffFiles: files });
    return files;
  },

  setError: (wsId, error) => updateWs(set, wsId, { error }),
}));

function applyGitAppState(
  set: (fn: (s: VcsStore) => Partial<VcsStore>) => void,
  get: () => VcsStore,
  wsId: string,
  data: unknown,
): void {
  const state: GitAppState = normalizeGitAppState(data);
  const ws = getWs(get(), wsId);

  // While the user is paging deep history via IPC, keep the paged depth but
  // replace the cache-covered prefix so new commits still appear.
  const derivedLog = deriveHeadLog(state, (ws.logPage + 1) * PAGE_SIZE);
  const logEntries = ws.logPage > 0 && ws.logEntries.length > derivedLog.length
    ? mergePagedLog(derivedLog, ws.logEntries)
    : derivedLog;

  updateWs(set, wsId, {
    repoPath: state.repoPath,
    branches: adaptBranches(state),
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
