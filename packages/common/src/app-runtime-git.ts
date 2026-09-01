/**
 * Git surface of the background app runtime contract — worktrees, sync, and
 * pull-request operations shared between the desktop host and runtime-enabled
 * Sero plugins.
 *
 * Split out of app-runtime-background.ts to keep that file under the source-size
 * limit. Renderer-safe / Node-agnostic (types only), so external plugins can type
 * against it without importing desktop-internal modules.
 */

import type { AppRuntimeWorktreePoolApi } from './app-runtime-worktree-pool';

// The lease-based worktree pool contract lives in ./app-runtime-worktree-pool;
// re-exported here so existing '@sero-ai/common' imports keep resolving.
export type {
  AppRuntimeWorktreeBranchKind,
  AppRuntimeWorktreeLease,
  AppRuntimeAcquireWorktreeRequest,
  AppRuntimeAcquireWorktreeResult,
  AppRuntimeReattachWorktreeRequest,
  AppRuntimeReattachWorktreeResult,
  AppRuntimeWorktreeDisposition,
  AppRuntimeReleaseWorktreeRequest,
  AppRuntimeReleaseWorktreeStatus,
  AppRuntimeReleaseWorktreeResult,
  AppRuntimeWorktreeRegistrationClassification,
  AppRuntimeWorktreeFilesystemEvidence,
  AppRuntimeWorktreeProcessEvidence,
  AppRuntimeWorktreeCleanlinessEvidence,
  AppRuntimeWorktreePoolSlotState,
  AppRuntimeWorktreeCleanupClassification,
  AppRuntimeWorktreeCleanupFingerprint,
  AppRuntimeWorktreeCleanupAction,
  AppRuntimeWorktreePoolSlotStatus,
  AppRuntimeWorktreePoolStatus,
  AppRuntimeWorktreeCleanupPlan,
  AppRuntimeWorktreePoolStatusResult,
  AppRuntimeCreateWorktreeCleanupPlanResult,
  AppRuntimeWorktreeCleanupSlotResult,
  AppRuntimeExecuteWorktreeCleanupPlanResult,
  AppRuntimeWorktreePoolApi,
} from './app-runtime-worktree-pool';

export interface AppRuntimeWorktreeCreateResult {
  worktreePath: string;
  branchName: string;
  greenfield: boolean;
}

export interface AppRuntimeWorktreeRemoveOptions {
  /** Force-delete the local branch after removing the worktree. */
  deleteBranch?: boolean;
  /** Delete the local branch only when Git confirms it is fully merged. */
  deleteMergedBranch?: boolean;
  force?: boolean;
}

export interface AppRuntimeConflictResolutionContext {
  attempt: number;
  baseBranch: string;
  upstreamRef: string;
  conflictFiles: string[];
}

export interface AppRuntimeWorktreeSyncOptions {
  resolveConflicts?: (context: AppRuntimeConflictResolutionContext) => Promise<boolean>;
}

export interface AppRuntimeWorktreeSyncResult {
  success: boolean;
  baseBranch?: string;
  upstreamRef?: string;
  updated: boolean;
  resolvedConflicts: boolean;
  error?: string;
}

export interface AppRuntimeWorkspaceSyncResult {
  synced: boolean;
  branch?: string;
  headChanged?: boolean;
  reason?: string;
}

export interface AppRuntimeCreatePullRequestOptions {
  title: string;
  body: string;
  baseBranch?: string;
  draft?: boolean;
}

export type AppRuntimeCreatePullRequestResult =
  | { success: true; url: string; number: number }
  | { success: false; error: string };

export type AppRuntimePullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export type AppRuntimeMergePullRequestResult =
  | { success: true; state: 'merged' | 'scheduled' }
  | { success: false; error: string };

export type AppRuntimePullRequestMergeState = 'merged' | 'open' | 'closed' | 'unknown';

/** An open pull request in this workspace's repo (from `gh pr list`). */
export interface AppRuntimePullRequestSummary {
  number: number;
  url: string;
  title: string;
  headRefName: string;
  updatedAt: string;
  body?: string;
}

/** An open issue in this workspace's repo (from `gh issue list`). */
export interface AppRuntimeIssueSummary {
  number: number;
  url: string;
  title: string;
  labels: string[];
  assignees: string[];
  updatedAt: string;
}

export interface AppRuntimeWorkspaceStatusResult {
  isGitRepository: boolean;
  hasUncommittedChanges: boolean;
  summary: string;
}

export interface AppRuntimeDirtyWorkspaceStashResult {
  stashRef: string | null;
}

export interface AppRuntimeWorktreeCreateOptions {
  /**
   * Check out this existing branch (fetched from origin when only remote)
   * instead of minting a new one — for work that must land on a PR's own
   * branch. Removal of such a worktree must never delete the branch.
   */
  existingBranch?: string;
}

export interface AppRuntimeGitApi extends AppRuntimeWorktreePoolApi {
  /**
   * @deprecated Legacy key-addressed creation, kept only for `card-*`
   * checkouts made before the lease pool. It allocates no pool slot; new work
   * must use `acquireWorktree`.
   */
  createWorktree(
    workspacePath: string,
    cardId: string,
    cardTitle: string,
    options?: AppRuntimeWorktreeCreateOptions,
  ): Promise<AppRuntimeWorktreeCreateResult>;
  /**
   * @deprecated Legacy key-addressed removal. A logical key is not a release
   * fence, so this can never recycle a pooled slot — use `releaseWorktree`.
   */
  removeWorktree(
    workspacePath: string,
    cardId: string,
    options?: AppRuntimeWorktreeRemoveOptions,
  ): Promise<void>;
  /**
   * Workspace-root dirty preflight (Orchestrator workspace-root mode only).
   * Reports whether the registered workspace root has uncommitted changes,
   * ignoring Sero-managed paths under `.sero/`.
   */
  getWorkspaceStatus(workspacePath: string): Promise<AppRuntimeWorkspaceStatusResult>;
  /** Stashes current workspace changes after an explicit user choice. */
  stashWorkspaceChanges(
    workspacePath: string,
    message: string,
  ): Promise<AppRuntimeDirtyWorkspaceStashResult>;
  syncWorktreeWithDefaultBranch(
    worktreePath: string,
    options?: AppRuntimeWorktreeSyncOptions,
  ): Promise<AppRuntimeWorktreeSyncResult>;
  syncWorkspaceRootToDefaultBranch(
    workspacePath: string,
  ): Promise<AppRuntimeWorkspaceSyncResult>;
  createCheckpoint(worktreePath: string, message: string): Promise<string | null>;
  getDiffSummary(worktreePath: string): Promise<string>;
  getDiff(worktreePath: string): Promise<string>;
  pushBranch(worktreePath: string, branchName: string): Promise<boolean>;
  ensureRemoteDefaultBranch(worktreePath: string): Promise<string>;
  /**
   * Lists open pull requests in this workspace's repo (repo-scoped, so it works
   * before any worktree exists). Fail-soft to `[]` when `gh`, the remote, or PRs
   * are absent. Per-loop attribution is done by the caller via branch-name match.
   */
  listPullRequests(
    workspacePath: string,
    options?: { author?: string },
  ): Promise<AppRuntimePullRequestSummary[]>;
  /**
   * Lists open issues in this workspace's repo (repo-scoped, `gh issue list`).
   * Fail-soft to `[]` when `gh`, the remote, or issues are absent — a workspace
   * without a GitHub remote simply contributes no issue cards.
   */
  listIssues(workspacePath: string): Promise<AppRuntimeIssueSummary[]>;
  createPr(
    worktreePath: string,
    options: AppRuntimeCreatePullRequestOptions,
  ): Promise<AppRuntimeCreatePullRequestResult>;
  mergePr(
    worktreePath: string,
    prNumber: number,
    options?: { method?: AppRuntimePullRequestMergeMethod },
  ): Promise<AppRuntimeMergePullRequestResult>;
  getPrMergeState(
    worktreePath: string,
    prNumber: number,
  ): Promise<AppRuntimePullRequestMergeState>;
  getPrMergeError(worktreePath: string, prNumber: number): Promise<string | null>;
}
