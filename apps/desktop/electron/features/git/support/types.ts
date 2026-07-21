// Re-export shared VCS contracts from the canonical neutral shared module.
// Electron-only types (GitResult, CreateCheckpointOptions) are defined below.
import type { VcsCheckpointSource } from '@sero-ai/common';

export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  VcsEvent,
  CommitEntry,
  WorkingCopyStatus,
  StatusFile,
  FileStatus,
  FileDiffEntry,
  Branch,
  BranchRemoteStatus,
  Remote,
  SyncResult,
} from '@sero-ai/common';

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CreateCheckpointOptions {
  source: VcsCheckpointSource;
  description?: string;
}
