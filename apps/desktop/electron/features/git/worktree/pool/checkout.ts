/**
 * Direct evidence about one physical checkout: is it clean, and does its
 * branch still hold work the base does not have?
 *
 * Both answers can fail to be computed, and a failure is never read as "safe".
 * `unknown` is a distinct outcome from `clean`, and every caller treats it as
 * a reason to preserve.
 */

import { execWorktreeGit } from '../exec';
import { stderrOf } from '../provision';

export type CleanlinessResult =
  /** No tracked modification and no untracked file. Ignored files may remain. */
  | { status: 'clean' }
  | { status: 'dirty'; detail: string }
  | { status: 'unknown'; reason: string };

/**
 * Mirrors the check `git worktree remove` makes: `--porcelain` reports tracked
 * modifications and untracked files, and says nothing about ignored paths, so
 * `node_modules` and build output never make a checkout "dirty".
 */
export async function checkoutCleanliness(worktreePath: string): Promise<CleanlinessResult> {
  try {
    const { stdout } = await execWorktreeGit(['status', '--porcelain', '--untracked-files=all'], {
      cwd: worktreePath,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const entries = stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (entries.length === 0) return { status: 'clean' };
    return { status: 'dirty', detail: `${entries.length} uncommitted change(s), including ${entries[0]}` };
  } catch (error) {
    return { status: 'unknown', reason: stderrOf(error).trim() || 'git status failed' };
  }
}

export type BranchWorkResult =
  | { status: 'no-work' }
  | { status: 'has-work'; commits: number }
  | { status: 'unknown'; reason: string };

/**
 * Commits on the checkout's HEAD that the acquisition base does not contain.
 * Used only to label a preserved checkout honestly; it is not a merge proof —
 * a squash or rebase merge leaves commits here that are already in the base.
 * Proving disposability is PR 2's job.
 */
export async function branchWorkSinceBase(
  worktreePath: string,
  baseCommit: string | null,
): Promise<BranchWorkResult> {
  if (!baseCommit) return { status: 'unknown', reason: 'No base commit was recorded at acquisition.' };
  try {
    const { stdout } = await execWorktreeGit(['rev-list', '--count', `${baseCommit}..HEAD`], {
      cwd: worktreePath,
      timeout: 15_000,
    });
    const commits = Number.parseInt(stdout.trim(), 10);
    if (!Number.isFinite(commits)) return { status: 'unknown', reason: 'Git returned no commit count.' };
    return commits === 0 ? { status: 'no-work' } : { status: 'has-work', commits };
  } catch (error) {
    return { status: 'unknown', reason: stderrOf(error).trim() || 'git rev-list failed' };
  }
}
