/**
 * Worktree PR orchestration — remote default-branch setup and PR creation
 * for background worktrees. All gh execution goes through the shared GitHub
 * primitives in ../github/; only the git-side flow logic lives here.
 */

import { execWorktreeGit } from './exec';
import { ghError } from '../github/helpers';
import { ghForPath } from '../github/invoker';
import { createPullRequest, viewCurrentPullRequest } from '../github/pull-requests';
import { getGithubDefaultBranch, setGithubDefaultBranch } from '../github/default-branch';

async function fetchRemoteRefs(worktreePath: string): Promise<void> {
  try {
    await execWorktreeGit(['fetch', 'origin'], {
      cwd: worktreePath,
      timeout: 30_000,
    });
  } catch {
    // Best-effort — remote may not exist yet
  }
}

async function setLocalRemoteHead(worktreePath: string, branch: string): Promise<void> {
  try {
    await execWorktreeGit(['remote', 'set-head', 'origin', branch], {
      cwd: worktreePath,
      timeout: 10_000,
    });
  } catch {
    // Best-effort — local origin/HEAD can be stale without breaking PR creation
  }
}

async function ensureGithubDefaultBranch(worktreePath: string, branch: string): Promise<void> {
  const gh = ghForPath(worktreePath);
  try {
    const current = await getGithubDefaultBranch(gh);
    if (current === branch) {
      await setLocalRemoteHead(worktreePath, branch);
      return;
    }

    await setGithubDefaultBranch(gh, branch);
    await setLocalRemoteHead(worktreePath, branch);
    console.log(`[worktree-git] Set GitHub default branch to ${branch}`);
  } catch (err: unknown) {
    console.warn(
      `[worktree-git] Failed to set GitHub default branch to ${branch}: ${ghError(err).message}`,
    );
  }
}

async function applyRemoteDefaultBranch(worktreePath: string, branch: string): Promise<string> {
  await ensureGithubDefaultBranch(worktreePath, branch);
  return branch;
}

export async function ensureRemoteDefaultBranch(worktreePath: string): Promise<string> {
  await fetchRemoteRefs(worktreePath);

  const sharedHistoryChecks = await Promise.all(['main', 'master'].map(async (branch) => {
    try {
      const r = await execWorktreeGit(['ls-remote', '--heads', 'origin', branch], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      if (!r.stdout.trim()) return null;

      await execWorktreeGit(['merge-base', `origin/${branch}`, 'HEAD'], {
        cwd: worktreePath,
        timeout: 10_000,
      });
      return branch;
    } catch {
      // no shared history or branch doesn't exist
      return null;
    }
  }));
  const sharedHistoryBranch = sharedHistoryChecks.find((branch): branch is string => branch !== null);
  if (sharedHistoryBranch) return applyRemoteDefaultBranch(worktreePath, sharedHistoryBranch);

  const existingRemoteChecks = await Promise.all(['main', 'master'].map(async (branch) => {
    try {
      const r = await execWorktreeGit(['ls-remote', '--heads', 'origin', branch], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      if (!r.stdout.trim()) return null;

      const countResult = await execWorktreeGit([
        'rev-list', '--count', `origin/${branch}`,
      ], { cwd: worktreePath, timeout: 10_000 });
      const commitCount = parseInt(countResult.stdout.trim(), 10);

      if (commitCount > 1) {
        console.warn(
          `[worktree-git] Remote '${branch}' has ${commitCount} commits but no shared history with HEAD. ` +
          `Using it as PR base to avoid overwriting existing work.`,
        );
        return branch;
      }
    } catch {
      // branch doesn't exist or fetch failed
      return null;
    }
    return null;
  }));
  const existingRemoteBranch = existingRemoteChecks.find((branch): branch is string => branch !== null);
  if (existingRemoteBranch) return applyRemoteDefaultBranch(worktreePath, existingRemoteBranch);

  console.log('[worktree-git] Setting up remote main from feature branch root commit');
  try {
    const rootResult = await execWorktreeGit(['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: worktreePath,
      timeout: 10_000,
    });
    const rootCommit = rootResult.stdout.trim().split('\n')[0];

    if (rootCommit) {
      await execWorktreeGit(['update-ref', 'refs/heads/main', rootCommit], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      await execWorktreeGit(['push', '--force-with-lease', '-u', 'origin', 'main'], {
        cwd: worktreePath,
        timeout: 30_000,
      });
      await ensureGithubDefaultBranch(worktreePath, 'main');
      console.log(`[worktree-git] Created main at root commit ${rootCommit.slice(0, 12)} and pushed`);
      return 'main';
    }
  } catch (err: unknown) {
    console.error('[worktree-git] Failed to create default branch:', ghError(err).message);
  }

  return 'main';
}

async function resolveDefaultBranch(worktreePath: string): Promise<string> {
  try {
    const r = await execWorktreeGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    const ref = r.stdout.trim();
    const branch = ref.split('/').pop();
    if (branch) return branch;
  } catch {
    // no remote HEAD
  }

  const branchChecks = await Promise.all(['main', 'master'].map(async (branch) => {
    const hasRemote = await execWorktreeGit(['rev-parse', '--verify', `origin/${branch}`], {
      cwd: worktreePath,
      timeout: 5_000,
    }).then(() => true, () => false);
    if (hasRemote) return branch;
    const hasLocal = await execWorktreeGit(['rev-parse', '--verify', branch], {
      cwd: worktreePath,
      timeout: 5_000,
    }).then(() => true, () => false);
    return hasLocal ? branch : null;
  }));
  const branch = branchChecks.find((candidate): candidate is string => candidate !== null);
  if (branch) return branch;

  return 'main';
}

export async function createPrFromWorktree(
  worktreePath: string,
  opts: { title: string; body: string; baseBranch?: string; draft?: boolean },
): Promise<{ success: true; url: string; number: number } | { success: false; error: string }> {
  const base = opts.baseBranch ?? await resolveDefaultBranch(worktreePath);
  const result = await createPullRequest(ghForPath(worktreePath), {
    base,
    title: opts.title,
    body: opts.body,
    draft: opts.draft,
  });

  if (result.success) {
    if (result.url && result.number) {
      console.log(`[worktree-git] Created PR #${result.number}: ${result.url}`);
    }
    return { success: true, url: result.url ?? '', number: result.number ?? 0 };
  }

  if (result.message.includes('already exists')) {
    const existing = await viewCurrentPullRequest(ghForPath(worktreePath));
    if (existing) return { success: true, ...existing };
  }

  console.error('[worktree-git] PR creation failed:', result.message);
  return { success: false, error: result.message };
}
