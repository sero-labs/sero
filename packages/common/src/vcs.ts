export type VcsCheckpointSource = 'turn' | 'fs' | 'manual' | 'restore';

export interface VcsCheckpoint {
  changeId: string;
  description: string;
  source: VcsCheckpointSource;
  createdAt: string;
}

export interface VcsWorkspaceState {
  workspaceId: string;
  currentChangeId: string | null;
  hasWorkingCopyChanges: boolean;
  checkpoints: VcsCheckpoint[];
}

export interface ChangeEntry {
  changeId: string;
  commitId: string;
  author: string;
  email: string;
  timestamp: string;
  description: string;
  empty: boolean;
  conflict: boolean;
  immutable: boolean;
  isWorkingCopy: boolean;
  bookmarks: string[];
  tags: string[];
}

export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'conflict';

export interface StatusFile {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

export interface WorkingCopyStatus {
  files: StatusFile[];
  conflictCount: number;
  parentChangeIds: string[];
}

export interface FileDiffEntry {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

export interface BookmarkRemoteStatus {
  remote: string;
  synced: boolean;
}

export interface Bookmark {
  name: string;
  changeId: string;
  isLocal: boolean;
  remoteStatuses: BookmarkRemoteStatus[];
}

export interface Remote {
  name: string;
  url: string;
}

export interface OperationEntry {
  id: string;
  timestamp: string;
  description: string;
}

export interface PushPreview {
  bookmarks: string[];
  willCreate: string[];
  message: string;
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
