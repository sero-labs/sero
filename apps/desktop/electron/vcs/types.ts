// Re-export shared VCS types from the canonical renderer location.
// Electron-only types (JjResult, CreateCheckpointOptions) are defined below.
import type { VcsCheckpointSource } from '../../src/types/vcs';

export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  VcsEvent,
  ChangeEntry,
  WorkingCopyStatus,
  StatusFile,
  FileStatus,
  FileDiffEntry,
  Bookmark,
  BookmarkRemoteStatus,
  Remote,
  OperationEntry,
  SyncResult,
  PushPreview,
} from '../../src/types/vcs';

export interface JjResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CreateCheckpointOptions {
  source: VcsCheckpointSource;
  description?: string;
}
