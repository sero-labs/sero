/**
 * Git store — the working tree of one workspace.
 *
 * Everything here belongs to `workspaceId`. A reply for another workspace,
 * or one that arrives after the panel moved on, is dropped, so what the
 * panel shows and what a commit acts on are always the same tree.
 *
 * The status is refetched by hand and whenever a turn finishes in that
 * workspace, because a turn is what changes files. Diffs are fetched one
 * file at a time and kept, so going back to a file already opened costs
 * nothing.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflict';

export interface GitFile {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  detached: boolean;
  merging: boolean;
  files: GitFile[];
}

export interface GitDiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface GitDiffHunk {
  oldStart: number;
  newStart: number;
  lines: GitDiffLine[];
}

export interface GitDiff {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  staged: boolean;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
  /** True when lines were dropped to keep the payload sane. */
  truncated: boolean;
}

/** What a finished commit reports back. */
export interface GitCommitResult {
  hash: string;
  branch: string;
  fileCount: number;
}

interface GitStore {
  /** The workspace the status, diffs and selection belong to. */
  workspaceId: string | null;
  status: GitStatus | null;
  loading: boolean;
  /** The file whose diff is on screen. */
  openPath: string | null;
  /** Diffs already fetched, keyed by `staged:path`. */
  diffs: Record<string, GitDiff>;
  /** Paths ticked for the next commit. */
  selectedPaths: string[];
  committing: boolean;
  /** The last commit made from here, for the confirmation line. */
  lastCommit: GitCommitResult | null;
  error: string | null;

  refresh: (workspaceId: string) => void;
  openFile: (workspaceId: string, file: GitFile) => void;
  closeFile: () => void;
  toggleSelected: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  commit: (workspaceId: string, message: string) => void;
  dismissError: () => void;
  handleMessage: (msg: GatewayMessage) => void;
}

/** One diff per file per side of the index. */
export function diffKey(path: string, staged: boolean): string {
  return `${staged ? 'staged' : 'working'}:${path}`;
}

function getClient() {
  return useConnectionStore.getState().client;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function readStatus(value: unknown): GitStatus | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.files)) return null;

  return {
    branch: typeof record.branch === 'string' ? record.branch : '',
    ahead: typeof record.ahead === 'number' ? record.ahead : 0,
    behind: typeof record.behind === 'number' ? record.behind : 0,
    detached: record.detached === true,
    merging: record.merging === true,
    files: record.files.flatMap((file) => {
      if (!file || typeof file !== 'object') return [];
      const entry = file as Record<string, unknown>;
      if (typeof entry.path !== 'string' || typeof entry.status !== 'string') return [];
      return [{
        path: entry.path,
        oldPath: typeof entry.oldPath === 'string' ? entry.oldPath : undefined,
        status: entry.status as GitFileStatus,
        staged: entry.staged === true,
      }];
    }),
  };
}

function readDiff(value: unknown): GitDiff | null {
  if (!value || typeof value !== 'object') return null;
  const diff = value as GitDiff;
  return typeof diff.path === 'string' ? diff : null;
}

function readCommit(value: unknown): GitCommitResult | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.hash !== 'string') return null;
  return {
    hash: record.hash,
    branch: typeof record.branch === 'string' ? record.branch : '',
    fileCount: typeof record.fileCount === 'number' ? record.fileCount : 0,
  };
}

/** The state the panel starts from for a workspace. */
const EMPTY_TREE = {
  status: null,
  loading: false,
  openPath: null,
  diffs: {},
  selectedPaths: [],
  committing: false,
  lastCommit: null,
  error: null,
} satisfies Partial<GitStore>;

export const useGitStore = create<GitStore>((set, get) => {
  /** Counts refreshes, so a slow reply cannot land over a newer one. */
  let refreshSeq = 0;

  /** True when the store has moved to another workspace since `workspaceId`. */
  const stale = (workspaceId: string) => get().workspaceId !== workspaceId;

  return {
    workspaceId: null,
    ...EMPTY_TREE,

    refresh: (workspaceId: string) => {
      const client = getClient();
      if (!client) return;
      // Another workspace's tree must not stay on screen while this
      // one loads: the branch and files shown would be the wrong ones.
      if (stale(workspaceId)) set({ workspaceId, ...EMPTY_TREE });

      const seq = ++refreshSeq;
      set({ loading: true, error: null });
      client.gitStatus(workspaceId).then(
        (data) => {
          if (stale(workspaceId) || seq !== refreshSeq) return;
          const status = readStatus(data);
          // A refresh replaces the tree, so old diffs would be stale.
          set((s) => ({
            status,
            loading: false,
            diffs: {},
            selectedPaths: status
              ? s.selectedPaths.filter((path) => status.files.some((file) => file.path === path))
              : [],
          }));
        },
        (err: unknown) => {
          if (stale(workspaceId) || seq !== refreshSeq) return;
          set({ loading: false, error: errorText(err, 'Could not read the working tree.') });
        },
      );
    },

    openFile: (workspaceId: string, file: GitFile) => {
      if (stale(workspaceId)) return;
      set({ openPath: file.path });
      // A diff already fetched is still true until the next refresh clears it.
      if (get().diffs[diffKey(file.path, file.staged)]) return;
      // A diff belongs to the tree it was asked against. One that lands
      // after a refresh would show the old file under the new tree.
      const seq = refreshSeq;
      getClient()?.gitDiff(workspaceId, file.path, file.staged).then(
        (data) => {
          const diff = readDiff(data);
          if (!diff || stale(workspaceId) || seq !== refreshSeq) return;
          set((s) => ({ diffs: { ...s.diffs, [diffKey(diff.path, diff.staged)]: diff } }));
        },
        (err: unknown) => {
          if (stale(workspaceId)) return;
          set({ error: errorText(err, 'Could not read the diff.') });
        },
      );
    },

    closeFile: () => set({ openPath: null }),

    toggleSelected: (path: string) => {
      set((s) => ({
        selectedPaths: s.selectedPaths.includes(path)
          ? s.selectedPaths.filter((selected) => selected !== path)
          : [...s.selectedPaths, path],
      }));
    },

    selectAll: () => {
      set((s) => ({ selectedPaths: [...new Set((s.status?.files ?? []).map((f) => f.path))] }));
    },

    clearSelection: () => set({ selectedPaths: [] }),

    commit: (workspaceId: string, message: string) => {
      const client = getClient();
      if (!client) return;
      const { selectedPaths, status } = get();
      if (selectedPaths.length === 0) return;
      // The selection was made against the tree on screen. Committing
      // it into another workspace would commit files nobody looked at.
      if (stale(workspaceId) || !status) {
        set({ error: 'The changes shown are not from this workspace. Refresh first.' });
        return;
      }

      set({ committing: true, error: null, lastCommit: null });
      client.gitCommit(workspaceId, message, selectedPaths).then(
        (data) => {
          if (stale(workspaceId)) return;
          set({ committing: false, lastCommit: readCommit(data), selectedPaths: [] });
          // The commit moved the tree, so what is shown is out of date.
          get().refresh(workspaceId);
        },
        (err: unknown) => {
          if (stale(workspaceId)) return;
          set({ committing: false, error: errorText(err, 'The commit failed.') });
        },
      );
    },

    dismissError: () => set({ error: null }),

    handleMessage: (msg: GatewayMessage) => {
      // A finished turn is what changes files, so it is the refresh
      // trigger. Only a turn in the workspace on screen counts.
      if (msg.type !== 'turn_complete') return;
      const { workspaceId, status } = get();
      if (workspaceId && status && msg.workspaceId === workspaceId) get().refresh(workspaceId);
    },
  };
});

/** Changed files with no duplicate path, staged copy first. */
export function selectFiles(status: GitStatus | null): GitFile[] {
  if (!status) return [];
  const byPath = new Map<string, GitFile>();
  for (const file of status.files) {
    if (!byPath.has(file.path) || file.staged) byPath.set(file.path, file);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
