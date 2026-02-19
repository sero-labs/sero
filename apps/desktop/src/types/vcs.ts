// ── Checkpoint types (existing, kept for backward compat) ────

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

// ── Rich change log entry ────────────────────────────────────

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

// ── Working copy status ──────────────────────────────────────

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

// ── Diff summary ─────────────────────────────────────────────

export interface FileDiffEntry {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

// ── Bookmarks ────────────────────────────────────────────────

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

// ── Remotes ──────────────────────────────────────────────────

export interface Remote {
  name: string;
  url: string;
}

// ── Operation log ────────────────────────────────────────────

export interface OperationEntry {
  id: string;
  timestamp: string;
  description: string;
}

// ── Push / Fetch results ─────────────────────────────────────

export interface PushPreview {
  bookmarks: string[];
  willCreate: string[];
  message: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
}

// ── Events ───────────────────────────────────────────────────

export type VcsEvent =
  | { type: 'checkpoint_created'; workspaceId: string; checkpoint: VcsCheckpoint }
  | { type: 'restored'; workspaceId: string; checkpointId: string }
  | { type: 'refreshed'; workspaceId: string }
  | { type: 'error'; workspaceId: string; error: string };
