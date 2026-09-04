/**
 * Git store — the working tree of the active workspace.
 *
 * The status is refetched by hand and whenever a turn finishes, because a
 * turn is what changes files. Diffs are fetched one file at a time and
 * kept, so going back to a file you already opened costs nothing.
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

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  loading: false,
  openPath: null,
  diffs: {},
  selectedPaths: [],
  committing: false,
  lastCommit: null,
  error: null,

  refresh: (workspaceId: string) => {
    const client = getClient();
    if (!client) return;
    set({ loading: true, error: null });
    client.gitStatus(workspaceId);
  },

  openFile: (workspaceId: string, file: GitFile) => {
    set({ openPath: file.path });
    // A diff already fetched is still true until the next refresh clears it.
    if (get().diffs[diffKey(file.path, file.staged)]) return;
    getClient()?.gitDiff(workspaceId, file.path, file.staged);
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
    const { selectedPaths } = get();
    if (selectedPaths.length === 0) return;
    set({ committing: true, error: null, lastCommit: null });
    client.gitCommit(workspaceId, message, selectedPaths);
  },

  dismissError: () => set({ error: null }),

  handleMessage: (msg: GatewayMessage) => {
    // A finished turn is what changes files, so it is the refresh trigger.
    if (msg.type === 'turn_complete') {
      const workspaceId = typeof msg.workspaceId === 'string' ? msg.workspaceId : null;
      if (workspaceId && get().status) get().refresh(workspaceId);
      return;
    }

    if (!('requestType' in msg)) return;
    const { requestType } = msg;
    if (requestType !== 'git_status' && requestType !== 'git_diff' && requestType !== 'git_commit') {
      return;
    }

    if (msg.type === 'error') {
      set({ loading: false, committing: false, error: msg.message });
      return;
    }
    if (msg.type !== 'ok') return;

    const data = (msg as { data?: unknown }).data;

    if (requestType === 'git_status') {
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
      return;
    }

    if (requestType === 'git_diff') {
      if (!data || typeof data !== 'object') return;
      const diff = data as GitDiff;
      if (typeof diff.path !== 'string') return;
      set((s) => ({ diffs: { ...s.diffs, [diffKey(diff.path, diff.staged)]: diff } }));
      return;
    }

    const commit = data as GitCommitResult | undefined;
    set({ committing: false, lastCommit: commit ?? null, selectedPaths: [] });
  },
}));

/** Changed files with no duplicate path, staged copy first. */
export function selectFiles(status: GitStatus | null): GitFile[] {
  if (!status) return [];
  const byPath = new Map<string, GitFile>();
  for (const file of status.files) {
    if (!byPath.has(file.path) || file.staged) byPath.set(file.path, file);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
