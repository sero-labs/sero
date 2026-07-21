// Compatibility barrel for legacy `@/types/vcs` imports.
// Canonical VCS contracts live in @sero-ai/common.
export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  CommitEntry,
  FileStatus,
  StatusFile,
  WorkingCopyStatus,
  FileDiffEntry,
  BranchRemoteStatus,
  Branch,
  Remote,
  SyncResult,
  PullRequestRef,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
  VcsEvent,
} from '@sero-ai/common';
