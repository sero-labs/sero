/**
 * Worktree lease contract — the host-owned allocation surface that Workflow
 * runs and Room members address instead of owning a fixed directory.
 *
 * A lease is an immutable identity for one acquisition of one physical
 * checkout. Every acquisition mints a new random `leaseId`, including a
 * reacquisition by the same holder in the same slot, so a delayed release from
 * an earlier run can never reset a slot that has already been reassigned.
 *
 * Renderer-safe / Node-agnostic (types only).
 */

/** Where a lease's branch came from. Governs what cleanup may touch. */
export type AppRuntimeWorktreeBranchKind = 'fresh-task' | 'external-pr';

export interface AppRuntimeWorktreeLease {
  /** Stable identity of the physical pool slot. */
  slotId: string;
  /** Immutable identity of THIS acquisition. Never reused. */
  leaseId: string;
  /** Logical consumer key (a Workflow run key, or a Room member key). */
  leaseHolder: string;
  worktreePath: string;
  branchName: string;
  branchKind: AppRuntimeWorktreeBranchKind;
  /** Ref the checkout was based on; null in a repository with no base ref yet. */
  baseRef: string | null;
  /** Commit the base ref resolved to at acquisition. Immutable evidence. */
  baseCommit: string | null;
  /** HEAD immediately after provisioning. Immutable evidence. */
  acquiredHead: string | null;
  acquiredAt: string;
  /** True when acquisition had to bootstrap a greenfield repository. */
  greenfield: boolean;
}

export interface AppRuntimeAcquireWorktreeRequest {
  /** Logical consumer key. Not a release fence — the lease identity is. */
  holder: string;
  /** Used to build the conventional fresh-task branch name. */
  title: string;
  /**
   * Check out this existing branch (fetched from origin when only remote)
   * instead of minting a new one — PR-lifecycle work. Such a branch is never
   * deleted by any release.
   */
  existingBranch?: string;
}

export type AppRuntimeAcquireWorktreeResult =
  | { status: 'acquired'; lease: AppRuntimeWorktreeLease }
  | { status: 'blocked'; reason: string };

/**
 * Proof request for a checkout a consumer persisted before a restart. A
 * `legacy` request names a pre-pool `card-*` checkout: the host adopts it only
 * when Git registration and branch agree with what the consumer remembers.
 */
export type AppRuntimeReattachWorktreeRequest =
  | { kind: 'lease'; holder: string; slotId: string; leaseId: string }
  | { kind: 'legacy'; holder: string; worktreePath: string; branchName?: string | null };

export type AppRuntimeReattachWorktreeResult =
  | { status: 'attached'; lease: AppRuntimeWorktreeLease }
  | { status: 'recovery-required'; reason: string };

/**
 * Caller intent, never authority. The host re-classifies the checkout and may
 * preserve it whatever was asked.
 */
export type AppRuntimeWorktreeDisposition = 'recycle' | 'preserve' | 'remove';

export interface AppRuntimeReleaseWorktreeRequest {
  slotId: string;
  /** The exact lease the caller believes it holds. */
  expectedLeaseId: string;
  /**
   * `recycle` is the routine end-of-run return: a checkout whose branch still
   * holds work the base does not is kept. `remove` is an explicitly authorised
   * disposal, so committed work on the branch no longer blocks it — the branch
   * itself survives unless a deletion flag below says otherwise. `preserve`
   * keeps the checkout whatever its state.
   */
  disposition: AppRuntimeWorktreeDisposition;
  /** Delete the local branch only when Git confirms it is fully merged. */
  deleteMergedBranch?: boolean;
  /**
   * Force-delete the local branch after a successful removal. Explicit user
   * authority only; never reaches a pull-request branch.
   */
  deleteBranch?: boolean;
}

/**
 * - `released` — the checkout was removed and the slot left the pool.
 * - `preserved` — the checkout was kept; `reason` says what blocked removal.
 * - `already-released` — a retry of a release that already succeeded. No change.
 * - `stale-lease` — the slot now holds a different lease. No change.
 * - `recovery-required` — evidence disagreed; the checkout was preserved.
 */
export type AppRuntimeReleaseWorktreeStatus =
  | 'released'
  | 'preserved'
  | 'already-released'
  | 'stale-lease'
  | 'recovery-required';

export interface AppRuntimeReleaseWorktreeResult {
  status: AppRuntimeReleaseWorktreeStatus;
  slotId: string;
  reason: string;
}

export interface AppRuntimeWorktreePoolApi {
  acquireWorktree(
    workspacePath: string,
    request: AppRuntimeAcquireWorktreeRequest,
  ): Promise<AppRuntimeAcquireWorktreeResult>;
  reattachWorktree(
    workspacePath: string,
    request: AppRuntimeReattachWorktreeRequest,
  ): Promise<AppRuntimeReattachWorktreeResult>;
  releaseWorktree(
    workspacePath: string,
    request: AppRuntimeReleaseWorktreeRequest,
  ): Promise<AppRuntimeReleaseWorktreeResult>;
}
