/**
 * Worktree removal, with the recursive-delete fallback removed.
 *
 * The old path ran `fs.rm(worktreePath, { recursive: true, force: true })`
 * after `git worktree remove` failed. A failed removal is exactly the case
 * where Git is telling us it cannot prove the checkout is disposable — dirty
 * tracked files, a lock, a submodule — so deleting the directory anyway
 * destroyed the work the failure was protecting. Git removal now either
 * succeeds (Git deletes the directory itself) or the directory is preserved
 * with a classified reason.
 */

import type { AppRuntimeWorktreeRemoveOptions } from '@sero-ai/common';

import { warnCleanupFailure } from '@electron/features/git/support/cleanup-warnings';
import { execWorktreeGit } from './exec';
import { stderrOf } from './provision';

export type WorktreeRemovalOutcome =
  /** Git removed the registration and the directory. */
  | { status: 'removed' }
  /** Git had no registration for the path; nothing was deleted. */
  | { status: 'not-registered'; detail: string }
  /** Git refused. The directory, its contents and its branch are untouched. */
  | { status: 'preserved'; detail: string };

/**
 * Removes one registered worktree. Never deletes a directory itself: when Git
 * refuses, the checkout is preserved for a classified cleanup decision.
 */
export async function removeRegisteredWorktree(
  workspacePath: string,
  worktreePath: string,
  options?: Pick<AppRuntimeWorktreeRemoveOptions, 'force'>,
): Promise<WorktreeRemovalOutcome> {
  const args = ['worktree', 'remove', worktreePath];
  if (options?.force) args.push('--force');

  try {
    await execWorktreeGit(args, { cwd: workspacePath, timeout: 15_000 });
    return { status: 'removed' };
  } catch (error: unknown) {
    const detail = stderrOf(error);
    if (detail.includes('is not a working tree') || detail.includes('No such file or directory')) {
      return { status: 'not-registered', detail: detail.trim() };
    }
    return { status: 'preserved', detail: detail.trim() || 'git worktree remove failed' };
  }
}

/**
 * Prunes registrations whose directories are gone. Only ever called after a
 * removal that Git itself completed, or an explicitly classified repair —
 * never speculatively because provisioning failed.
 */
export async function pruneWorktreeRegistrations(workspacePath: string): Promise<void> {
  try {
    await execWorktreeGit(['worktree', 'prune'], { cwd: workspacePath, timeout: 10_000 });
  } catch (error) {
    warnCleanupFailure(`failed to prune worktrees in ${workspacePath}`, error);
  }
}

/**
 * Deletes a local branch after its worktree was removed. `deleteMergedBranch`
 * defers to Git: an unmerged branch survives. Never called when removal failed.
 */
export async function deleteWorktreeBranch(
  workspacePath: string,
  branchName: string,
  options: Pick<AppRuntimeWorktreeRemoveOptions, 'deleteBranch' | 'deleteMergedBranch'>,
): Promise<void> {
  if (!options.deleteBranch && !options.deleteMergedBranch) return;
  try {
    await execWorktreeGit(['branch', options.deleteBranch ? '-D' : '-d', branchName], {
      cwd: workspacePath,
      timeout: 10_000,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!options.deleteMergedBranch || !detail.includes('not fully merged')) {
      warnCleanupFailure(`failed to delete branch ${branchName}`, error);
    }
  }
}
