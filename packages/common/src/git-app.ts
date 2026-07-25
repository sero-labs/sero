export type GitManagerAction =
  | 'refresh'
  | 'status'
  | 'log'
  | 'branches'
  | 'diff'
  | 'stage'
  | 'unstage'
  | 'discard'
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
  | 'abort_merge'
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

export interface GitActionResult {
  ok: boolean;
  message: string;
}

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

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflict';

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

// ── App state ───────────────────────────────────────────────

export type GitSyncMode = 'manual' | 'watch';

/**
 * A merge stopped part-way, which is a mode the app is in rather than a
 * property of any one file. Present only while `MERGE_HEAD` exists.
 */
export interface GitMergeState {
  /** What is being merged in — a branch name where git can name one, else a short sha. */
  fromRef: string;
  /** Git's own merge message, which is what concluding the merge commits with. */
  message: string;
  /**
   * Every path that conflicted during this merge, including ones already
   * resolved. Git forgets a conflict the moment the file is staged, so the
   * list is carried forward across refreshes for as long as the merge lasts —
   * without it the UI cannot tell a resolved file from one that merged cleanly.
   */
  conflictPaths: string[];
}

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

  /** HEAD is a commit rather than a branch. */
  detached: boolean;
  /** Set while a merge is in progress. */
  merge?: GitMergeState;

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
    // `defaultBranch` and `merge` are absent rather than set to `undefined`.
    // `@sero-ai/app-runtime` 0.2.1 fixed the hook that used to drop any
    // optional field defaulted to `undefined`, but a host pinned to 0.2.0 still
    // does — and a missing key is copied through untouched by both.
    branches: [],
    remoteBranches: [],
    remotes: [],
    commits: [],
    stashes: [],
    fileChanges: [],
    commitCount: 0,
    detached: false,
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
    detached: typeof state.detached === 'boolean' ? state.detached : defaults.detached,
    merge: normalizeMergeState(state.merge),
    lastRefresh: typeof state.lastRefresh === 'string' ? state.lastRefresh : defaults.lastRefresh,
    loading: typeof state.loading === 'boolean' ? state.loading : defaults.loading,
    syncMode: state.syncMode === 'watch'
      ? 'watch'
      : 'manual',
    error: typeof state.error === 'string' ? state.error : undefined,
  };
}

function normalizeMergeState(merge: GitMergeState | undefined): GitMergeState | undefined {
  if (!merge || typeof merge.fromRef !== 'string') return undefined;
  return {
    fromRef: merge.fromRef,
    message: typeof merge.message === 'string' ? merge.message : '',
    conflictPaths: Array.isArray(merge.conflictPaths) ? merge.conflictPaths : [],
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
