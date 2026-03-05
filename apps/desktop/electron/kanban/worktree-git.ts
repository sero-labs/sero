/**
 * Worktree git helpers — VCS operations scoped to a worktree directory.
 *
 * Unlike the main VcsManager which resolves cwd from workspaceId,
 * these functions take an explicit cwd (the worktree path) and
 * run git commands directly there.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Create a VCS checkpoint (git add + commit) in a worktree directory.
 *
 * @returns The short SHA of the new commit, or null if no changes to commit.
 */
export async function createCheckpointInWorktree(
  worktreePath: string,
  message: string,
): Promise<string | null> {
  // Check if there are changes to commit
  const status = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: worktreePath,
    timeout: 10_000,
  });

  if (!status.stdout.trim()) {
    console.log(`[worktree-git] No changes to checkpoint in ${worktreePath}`);
    return null;
  }

  // Stage all changes
  await execFileAsync('git', ['add', '-A'], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Commit
  await execFileAsync('git', ['commit', '-m', message], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Get the short SHA
  const sha = await execFileAsync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: worktreePath,
    timeout: 5_000,
  });

  const changeId = sha.stdout.trim();
  console.log(`[worktree-git] Checkpoint ${changeId}: ${message}`);
  return changeId;
}

/**
 * Get the diff of all changes in a worktree from the branch base.
 */
export async function getWorktreeDiff(worktreePath: string): Promise<string> {
  // Find the merge base with the main branch
  let baseBranch = 'main';
  try {
    const result = await execFileAsync('git', ['rev-parse', '--verify', 'main'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    if (result.stdout.trim()) baseBranch = 'main';
  } catch {
    // Try 'master' as fallback
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'master'], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      baseBranch = 'master';
    } catch {
      baseBranch = 'HEAD~10'; // fallback
    }
  }

  try {
    const diff = await execFileAsync('git', ['diff', `${baseBranch}...HEAD`], {
      cwd: worktreePath,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return diff.stdout;
  } catch {
    // If no commits yet on this branch, diff against the base
    const diff = await execFileAsync('git', ['diff', 'HEAD'], {
      cwd: worktreePath,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return diff.stdout;
  }
}
