/**
 * Shared types for the Git workspace manager app.
 *
 * The canonical definitions live in `@sero-ai/common` (`git-app.ts`) — the
 * contract between the host git service, the state.json file, and this UI.
 * This module re-exports them so plugin code keeps its local import path.
 */

export type {
  GitManagerAction,
  GitManagerRequest,
  GitActionResult,
  CommitNode,
  RefLabel,
  BranchInfo,
  RemoteInfo,
  FileChangeStatus,
  FileChange,
  StashEntry,
  DiffHunk,
  DiffLine,
  FileDiff,
  GitSyncMode,
  GitAppState,
  GitMergeState,
} from '@sero-ai/common';

export {
  createDefaultGitState,
  normalizeGitState,
  DEFAULT_GIT_STATE,
  BRANCH_COLORS,
} from '@sero-ai/common';
