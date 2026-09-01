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
  /** PR identity known at acquisition. Null for a fresh task or unknown PR. */
  pullRequestNumber: number | null;
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
  /** Authoritative PR identity for an existing branch, when the caller has it. */
  pullRequestNumber?: number;
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
  /**
   * Delete the local branch on explicit removal only when Git confirms it is
   * fully merged. Safe recycling separately deletes a fresh local branch with
   * an exact, proved tip fence.
   */
  deleteMergedBranch?: boolean;
  /**
   * Force-delete the local branch after a successful removal. Explicit user
   * authority only; never reaches a pull-request branch.
   */
  deleteBranch?: boolean;
}

/**
 * - `released` — the lease's checkout ended. The physical slot may remain as a
 *   detached, reusable checkout when the host proves it safe.
 * - `preserved` — the checkout was kept; `reason` says what blocked removal.
 * - `already-released` — an identical retry of a recorded release decision. No change.
 * - `stale-lease` — the slot now holds a different lease. No change.
 * - `recovery-required` — evidence disagreed, or a safe operation could not be
 *   recorded. Consult `checkout` before deciding whether to retain a reference.
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
  /** What this call established about the checkout named by the requested lease. */
  checkout: 'removed' | 'retained' | 'unknown';
}

export type AppRuntimeWorktreeRegistrationClassification =
  | 'exact'
  | 'missing'
  | 'conflicting'
  | 'unverifiable';
export type AppRuntimeWorktreeFilesystemEvidence = 'directory' | 'missing' | 'other' | 'unverifiable';
export type AppRuntimeWorktreeProcessEvidence = 'clear' | 'in-use' | 'unverifiable';
export type AppRuntimeWorktreeCleanlinessEvidence = 'clean' | 'dirty' | 'not-applicable' | 'unverifiable';
export type AppRuntimeWorktreePoolSlotState =
  | 'available'
  | 'leased'
  | 'provisioning'
  | 'recycling'
  | 'removing'
  | 'dirty'
  | 'unmerged'
  | 'in-use'
  | 'damaged'
  | 'orphaned'
  | 'recovery-required';
export type AppRuntimeWorktreeCleanupClassification =
  | 'removable-idle'
  | 'recoverable-registration'
  | 'recoverable-record'
  | 'preserved';

/** Complete evidence a confirmation is fenced to. Every field compares exactly. */
export interface AppRuntimeWorktreeCleanupFingerprint {
  repositoryId: string;
  slotId: string;
  leaseId: string | null;
  slotState: AppRuntimeWorktreePoolSlotState;
  canonicalPath: string;
  workspacePath: string;
  branchName: string | null;
  branchKind: AppRuntimeWorktreeBranchKind | null;
  head: string | null;
  preparedHead: string | null;
  resetTarget: { ref: string; commit: string } | null;
  registration: {
    classification: AppRuntimeWorktreeRegistrationClassification;
    head: string | null;
    branchName: string | null;
    detached: boolean;
    bare: boolean;
    locked: boolean;
    lockedReason: string | null;
    prunable: boolean;
    prunableReason: string | null;
  };
  filesystem: AppRuntimeWorktreeFilesystemEvidence;
  cleanliness: AppRuntimeWorktreeCleanlinessEvidence;
  process: AppRuntimeWorktreeProcessEvidence;
  classification: AppRuntimeWorktreeCleanupClassification;
}

export type AppRuntimeWorktreeCleanupAction =
  | { kind: 'remove'; reason: string }
  | {
    kind: 'repair';
    recovery: 'remove-missing-checkout-registration' | 'drop-absent-slot-record';
    reason: string;
  }
  | { kind: 'preserve'; reason: string };

export interface AppRuntimeWorktreePoolSlotStatus {
  slotId: string;
  state: AppRuntimeWorktreePoolSlotState;
  holder: string | null;
  branchName: string | null;
  branchKind: AppRuntimeWorktreeBranchKind | null;
  path: string;
  reason: string;
  action: AppRuntimeWorktreeCleanupAction;
  fingerprint: AppRuntimeWorktreeCleanupFingerprint;
}

export interface AppRuntimeWorktreePoolStatus {
  repositoryId: string;
  revision: number;
  observedAt: string;
  slots: AppRuntimeWorktreePoolSlotStatus[];
}

export interface AppRuntimeWorktreeCleanupPlan {
  planId: string;
  repositoryId: string;
  poolRevision: number;
  createdAt: string;
  expiresAt: string;
  slots: AppRuntimeWorktreePoolSlotStatus[];
}

export type AppRuntimeWorktreePoolStatusResult =
  | { status: 'ok'; pool: AppRuntimeWorktreePoolStatus }
  | { status: 'unavailable'; reason: string };
export type AppRuntimeCreateWorktreeCleanupPlanResult =
  | { status: 'planned'; plan: AppRuntimeWorktreeCleanupPlan }
  | { status: 'unavailable'; reason: string };
export type AppRuntimeWorktreeCleanupSlotResult =
  | { outcome: 'removed'; slotId: string; reason: string }
  | { outcome: 'repaired'; slotId: string; reason: string }
  | { outcome: 'skipped-stale'; slotId: string; reason: string }
  | { outcome: 'preserved'; slotId: string; reason: string }
  | { outcome: 'failed'; slotId: string; reason: string }
  | { outcome: 'recovery-required'; slotId: string; reason: string };
export type AppRuntimeExecuteWorktreeCleanupPlanResult =
  | { status: 'executed'; planId: string; results: AppRuntimeWorktreeCleanupSlotResult[] }
  | { status: 'rejected'; planId: string; reason: string };

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
  /** Reads the pool for the app runtime's host-bound workspace. */
  getWorktreePoolStatus(): Promise<AppRuntimeWorktreePoolStatusResult>;
  /** Creates a plan for the app runtime's host-bound workspace. */
  createWorktreeCleanupPlan(): Promise<AppRuntimeCreateWorktreeCleanupPlanResult>;
  executeWorktreeCleanupPlan(
    planId: string,
  ): Promise<AppRuntimeExecuteWorktreeCleanupPlanResult>;
}
