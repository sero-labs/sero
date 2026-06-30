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

export interface LoopWorkspaceRuntime {
  resolved?: ResolvedWorkspaceContext;
  dirtyPrompt?: DirtyWorkspacePrompt;
  lastDirtyCheckAt?: string;
  deferredReason?: string;
}
