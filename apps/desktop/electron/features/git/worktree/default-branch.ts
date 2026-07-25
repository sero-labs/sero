/**
 * Default-branch detection for path-addressed repos — the single
 * implementation the worktree sync flows share.
 */

import { execWorktreeGit } from './exec';

/** Injectable runner used by the sync flows (tests swap it out). */
export interface WorktreeGitRunner {
  run: (repoPath: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;
}

export const defaultWorktreeRunner: WorktreeGitRunner = {
  async run(repoPath, args, timeoutMs = 30_000) {
    const result = await execWorktreeGit(args, { cwd: repoPath, timeout: timeoutMs });
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

export async function refExists(
  repoPath: string,
  ref: string,
  runner: WorktreeGitRunner = defaultWorktreeRunner,
): Promise<boolean> {
  try {
    await runner.run(repoPath, ['rev-parse', '--verify', ref], 10_000);
    return true;
  } catch {
    return false;
  }
}

/** origin/HEAD symbolic ref, then main/master (remote or local). */
export async function detectDefaultBranch(
  repoPath: string,
  runner: WorktreeGitRunner = defaultWorktreeRunner,
): Promise<string | null> {
  try {
    const result = await runner.run(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD'], 10_000);
    const branch = result.stdout.trim().split('/').pop();
    if (branch) return branch;
  } catch {
    // Fall through to common branch names.
  }

  const branchChecks = await Promise.all(['main', 'master'].map(async (branch) => ({
    branch,
    hasRemote: await refExists(repoPath, `refs/remotes/origin/${branch}`, runner),
    hasLocal: await refExists(repoPath, `refs/heads/${branch}`, runner),
  })));
  const match = branchChecks.find(({ hasRemote, hasLocal }) => hasRemote || hasLocal);
  return match?.branch ?? null;
}
