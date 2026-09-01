/**
 * Workspace settings and runtime-context types. Split from types.ts to keep each
 * file within the 500-LOC limit; re-exported from types.ts so existing imports
 * are unaffected.
 */

// ── Workspace settings ──────────────────────────────────────

export interface LoopWorkspaceSettings {
  useManagedWorktree: boolean;
  reuseExistingWorktree: boolean;
  dirtyWorkspacePromptTimeoutMs: number;
  dirtyWorkspaceDefaultAction: 'create-managed-worktree';
  /**
   * Workspace-root mode only: run in place even when the workspace is dirty,
   * skipping the dirty preflight. User-owned opt-in; no effect under a managed
   * worktree. Default false (the preflight prompts as before).
   */
  allowDirtyWorkspaceRoot: boolean;
  /**
   * Where a managed worktree's branch comes from (spec 15). 'new' (default,
   * also when absent) mints a fresh branch per run. 'event-pr' checks out the
   * PR branch named by the firing event — payload `branch`, else
   * `prNumber`/`number` looked up in the open-PR list — so commits land on
   * the PR's own branch; an unresolvable branch blocks the run visibly,
   * never falls back to a fresh branch. Requires useManagedWorktree.
   */
  worktreeBranchSource?: 'new' | 'event-pr';
}

// ── Workspace runtime context ───────────────────────────────

export interface ResolvedWorkspaceContext {
  id: string;
  type: 'workspace-root' | 'managed-worktree';
  workspaceRoot: string;
  cwd: string;
  worktreePath?: string;
  branchName?: string;
  /** Key the worktree was created under (per-iteration for recurring loops); used for cleanup. */
  worktreeKey?: string;
  /**
   * The pool lease this run's checkout is held under. `worktreeKey` names the
   * logical holder and is NOT a release fence; these two are. Absent on a
   * context resolved before the pool existed, which the host must prove
   * through legacy reattachment before the run may use it again.
   */
  slotId?: string;
  leaseId?: string;
  /** The branch belongs to a PR, not this loop — cleanup must never delete it. */
  externalBranch?: boolean;
  resolvedBy:
    | 'create-option'
    | 'clean-workspace'
    | 'dirty-workspace-choice'
    | 'dirty-workspace-timeout'
    | 'dirty-workspace-allowed';
  createdAt: string;
}

export type DirtyWorkspaceAction =
  | 'stash-current-changes'
  | 'create-managed-worktree'
  | 'defer-workflow'
  | 'run-in-workspace-root';

export interface DirtyWorkspacePrompt {
  id: string;
  status: 'pending' | 'resolved' | 'timed-out';
  detectedAt: string;
  expiresAt: string;
  decision?: DirtyWorkspaceDecision;
}

export interface DirtyWorkspaceDecision {
  action: DirtyWorkspaceAction;
  source: 'user' | 'timeout';
  decidedAt: string;
  stashRef?: string;
  contextId?: string;
}

/**
 * A checkout a cleanup did not release, and the host's own words for why.
 *
 * Preserving is the normal outcome for a run that committed anything: the
 * branch then holds work the base does not, and the issue's lifecycle keeps
 * that checkout until an explicit cleanup. The next run re-arms with a fresh
 * workspace, so without this record the loop would forget the checkout
 * entirely. The pool still holds the lease — the physical owner — and this is
 * the logical reference that names it from the loop's side.
 */
export interface PreservedWorktreeRecord {
  slotId: string;
  leaseId: string;
  /** Logical holder the lease was taken under (the run key). */
  worktreeKey: string;
  worktreePath: string;
  branchName?: string;
  outcome: 'preserved' | 'recovery-required' | 'stale-lease' | 'already-released';
  reason: string;
  at: string;
}

export interface LoopWorkspaceRuntime {
  resolved?: ResolvedWorkspaceContext;
  /** Checkouts previous runs left behind, newest first. Survives re-arming. */
  preservedWorktrees?: PreservedWorktreeRecord[];
  dirtyPrompt?: DirtyWorkspacePrompt;
  lastDirtyCheckAt?: string;
  deferredReason?: string;
}
