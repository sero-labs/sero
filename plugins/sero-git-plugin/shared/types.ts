/**
 * Shared state shape for the Git workspace manager app.
 *
 * Single source of truth — both the Pi extension and the
 * Sero web UI read/write a JSON file matching this shape.
 */

// ── Commit graph types ──────────────────────────────────────

export interface CommitNode {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string; // ISO
  subject: string;
  refs: RefLabel[];
}

export interface RefLabel {
  name: string;
  type: 'local' | 'remote' | 'tag' | 'head';
}

// ── Branch types ──────────────────────────────────────────────

export interface BranchInfo {
  name: string;
  current: boolean;
  remote?: string;       // e.g. "origin/main"
  ahead: number;
  behind: number;
  lastCommitHash?: string;
  lastCommitDate?: string;
  /** Absolute worktree path when the branch is checked out elsewhere. */
  checkedOutIn?: string;
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

// ── Working tree types ──────────────────────────────────────

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';

export interface FileChange {
  path: string;
  oldPath?: string;  // for renames
  status: FileChangeStatus;
  staged: boolean;
}

// ── Stash types ──────────────────────────────────────────────

export interface StashEntry {
  index: number;
  message: string;
  date: string;
  hash: string;
}

// ── Diff types ──────────────────────────────────────────────

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  hunks: DiffHunk[];
  binary: boolean;
  additions: number;
  deletions: number;
  staged?: boolean;
}

// ── Actions ─────────────────────────────────────────────────

export type GitManagerAction =
  | 'refresh'
  | 'status'
  | 'log'
  | 'branches'
  | 'diff'
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'checkout'
  | 'stash'
  | 'stash_pop'
  | 'stash_apply'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'create_branch'
  | 'delete_branch'
  | 'remove_worktree'
  | 'merge'
  | 'cherry_pick'
  | 'show_commit';

export interface GitManagerRequest {
  action: GitManagerAction;
  file?: string;
  message?: string;
  branch?: string;
  hash?: string;
  worktreePath?: string;
  staged?: boolean;
  all?: boolean;
  force?: boolean;
  stashIndex?: number;
}

// ── App state ───────────────────────────────────────────────

export type GitSyncMode = 'manual' | 'watch' | 'poll';

export interface GitAppState {
  repoPath: string;
  repoName: string;
  currentBranch: string;
  headHash: string;
  defaultBranch?: string;

  branches: BranchInfo[];
  remoteBranches: BranchInfo[];
  remotes: RemoteInfo[];
  commits: CommitNode[];
  stashes: StashEntry[];

  fileChanges: FileChange[];
  commitCount: number;

  /** Currently viewed diff (set by extension on demand) */
  activeDiff?: FileDiff;
  /** Currently viewed commit detail diff list */
  commitDiffs?: FileDiff[];
  selectedCommitHash?: string;

  lastRefresh: string; // ISO
  loading: boolean;
  syncMode: GitSyncMode;
  error?: string;
}

export function createDefaultGitState(): GitAppState {
  return {
    repoPath: '',
    repoName: '',
    currentBranch: '',
    headHash: '',
    defaultBranch: undefined,
    branches: [],
    remoteBranches: [],
    remotes: [],
    commits: [],
    stashes: [],
    fileChanges: [],
    commitCount: 0,
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode: 'manual',
  };
}

export function normalizeGitState(state: Partial<GitAppState> | null | undefined): GitAppState {
  const defaults = createDefaultGitState();
  if (!state) return defaults;

  return {
    ...defaults,
    ...state,
    repoPath: typeof state.repoPath === 'string' ? state.repoPath : defaults.repoPath,
    repoName: typeof state.repoName === 'string' ? state.repoName : defaults.repoName,
    currentBranch: typeof state.currentBranch === 'string' ? state.currentBranch : defaults.currentBranch,
    headHash: typeof state.headHash === 'string' ? state.headHash : defaults.headHash,
    defaultBranch: typeof state.defaultBranch === 'string' ? state.defaultBranch : undefined,
    branches: Array.isArray(state.branches) ? state.branches : defaults.branches,
    remoteBranches: Array.isArray(state.remoteBranches) ? state.remoteBranches : defaults.remoteBranches,
    remotes: Array.isArray(state.remotes) ? state.remotes : defaults.remotes,
    commits: Array.isArray(state.commits) ? state.commits : defaults.commits,
    stashes: Array.isArray(state.stashes) ? state.stashes : defaults.stashes,
    fileChanges: Array.isArray(state.fileChanges) ? state.fileChanges : defaults.fileChanges,
    commitDiffs: Array.isArray(state.commitDiffs) ? state.commitDiffs : undefined,
    lastRefresh: typeof state.lastRefresh === 'string' ? state.lastRefresh : defaults.lastRefresh,
    loading: typeof state.loading === 'boolean' ? state.loading : defaults.loading,
    syncMode: state.syncMode === 'watch' || state.syncMode === 'poll' || state.syncMode === 'manual'
      ? state.syncMode
      : defaults.syncMode,
    error: typeof state.error === 'string' ? state.error : undefined,
  };
}

export const DEFAULT_GIT_STATE: GitAppState = createDefaultGitState();

/** Vibrant branch colors for the commit graph — GitKraken-inspired */
export const BRANCH_COLORS = [
  '#818cf8', // indigo
  '#f59e0b', // amber
  '#34d399', // emerald
  '#f472b6', // pink
  '#60a5fa', // blue
  '#f87171', // red
  '#a78bfa', // violet
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#a3e635', // lime
];
