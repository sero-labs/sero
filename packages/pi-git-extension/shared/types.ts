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
}

// ── App state ───────────────────────────────────────────────

export interface GitAppState {
  repoPath: string;
  repoName: string;
  currentBranch: string;
  headHash: string;

  branches: BranchInfo[];
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
  error?: string;
}

export const DEFAULT_GIT_STATE: GitAppState = {
  repoPath: '',
  repoName: '',
  currentBranch: '',
  headHash: '',
  branches: [],
  remotes: [],
  commits: [],
  stashes: [],
  fileChanges: [],
  commitCount: 0,
  lastRefresh: new Date().toISOString(),
  loading: false,
};

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
