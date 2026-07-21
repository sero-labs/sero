export type VcsCheckpointSource = 'turn' | 'fs' | 'manual' | 'restore';

export interface VcsCheckpoint {
  sha: string;
  description: string;
  source: VcsCheckpointSource;
  createdAt: string;
}

export interface VcsWorkspaceState {
  workspaceId: string;
  currentSha: string | null;
  hasWorkingCopyChanges: boolean;
  checkpoints: VcsCheckpoint[];
}

export interface CommitEntry {
  /** Abbreviated commit SHA (12 chars). */
  sha: string;
  fullSha: string;
  author: string;
  email: string;
  timestamp: string;
  description: string;
  empty: boolean;
  conflict: boolean;
  immutable: boolean;
  isWorkingCopy: boolean;
  branches: string[];
  tags: string[];
}

/**
 * Sentinel revision meaning "the working tree" in diff APIs. Valid only as
 * the `to` side: the diff summary compares a commit against uncommitted
 * changes, and file contents are read from disk instead of a commit.
 */
export const WORKING_TREE_REV = ':working-tree';

export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'conflict';

export interface StatusFile {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

export interface WorkingCopyStatus {
  files: StatusFile[];
  conflictCount: number;
  parentShas: string[];
}

export interface FileDiffEntry {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

/** Aggregate diff counts of a checkout's branch work vs its base (`git diff --shortstat`). */
export interface GitDiffStat {
  files: number;
  additions: number;
  deletions: number;
}

export interface BranchRemoteStatus {
  remote: string;
  synced: boolean;
}

export interface Branch {
  name: string;
  sha: string;
  isLocal: boolean;
  remoteStatuses: BranchRemoteStatus[];
}

export interface Remote {
  name: string;
  url: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
}

export interface PullRequestRef {
  url: string;
  number: number;
  title: string;
  baseBranch: string;
}

export interface PullRequestState {
  defaultBaseBranch: string;
  sourceBranches: string[];
  targetBranches: string[];
}

export interface PullRequestPreview {
  sourceBranch: string;
  targetBranch: string;
  defaultBaseBranch: string;
  comparisonBase: string;
  hasChanges: boolean;
  changedFiles: number;
  files: FileDiffEntry[];
  blockingReason?: string;
  existingPr?: PullRequestRef;
}

export interface PullRequestDraft extends PullRequestPreview {
  title: string;
  body: string;
  model: string;
}

export interface CreatePullRequestInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface CreatePullRequestResult {
  success: boolean;
  message: string;
  url?: string;
  number?: number;
}

export type VcsEvent =
  | { type: 'checkpoint_created'; workspaceId: string; checkpoint: VcsCheckpoint }
  | { type: 'restored'; workspaceId: string; checkpointId: string }
  | { type: 'refreshed'; workspaceId: string }
  | { type: 'error'; workspaceId: string; error: string };
