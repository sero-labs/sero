import { execFile } from 'child_process';
import { promisify } from 'util';

import { getPullRequestMergeState } from './merge-status';

const execFileAsync = promisify(execFile);

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export type PullRequestMergeResult =
  | { success: true; state: 'merged' | 'scheduled' }
  | { success: false; error: string };

function execError(err: unknown): { stderr: string; message: string } {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; message?: unknown };
    return {
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      message: typeof e.message === 'string' ? e.message : String(err),
    };
  }
  return { stderr: '', message: String(err) };
}

async function fetchRemoteRefs(worktreePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['fetch', 'origin'], {
      cwd: worktreePath,
      timeout: 30_000,
    });
  } catch {
    // Best-effort — remote may not exist yet
  }
}

async function getGithubDefaultBranch(worktreePath: string): Promise<string | null> {
  try {
    const result = await execFileAsync('gh', [
      'repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name',
    ], {
      cwd: worktreePath,
      timeout: 30_000,
    });
    const branch = result.stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
}

async function setLocalRemoteHead(worktreePath: string, branch: string): Promise<void> {
  try {
    await execFileAsync('git', ['remote', 'set-head', 'origin', branch], {
      cwd: worktreePath,
      timeout: 10_000,
    });
  } catch {
    // Best-effort — local origin/HEAD can be stale without breaking PR creation
  }
}

async function ensureGithubDefaultBranch(worktreePath: string, branch: string): Promise<void> {
  try {
    const current = await getGithubDefaultBranch(worktreePath);
    if (current === branch) {
      await setLocalRemoteHead(worktreePath, branch);
      return;
    }

    await execFileAsync('gh', ['repo', 'edit', '--default-branch', branch], {
      cwd: worktreePath,
      timeout: 30_000,
    });
    await setLocalRemoteHead(worktreePath, branch);
    console.log(`[worktree-git] Set GitHub default branch to ${branch}`);
  } catch (err: unknown) {
    console.warn(
      `[worktree-git] Failed to set GitHub default branch to ${branch}: ${execError(err).message}`,
    );
  }
}

async function useRemoteDefaultBranch(worktreePath: string, branch: string): Promise<string> {
  await ensureGithubDefaultBranch(worktreePath, branch);
  return branch;
}

export async function ensureRemoteDefaultBranch(worktreePath: string): Promise<string> {
  await fetchRemoteRefs(worktreePath);

  for (const branch of ['main', 'master']) {
    try {
      const r = await execFileAsync('git', ['ls-remote', '--heads', 'origin', branch], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      if (!r.stdout.trim()) continue;

      await execFileAsync('git', ['merge-base', `origin/${branch}`, 'HEAD'], {
        cwd: worktreePath,
        timeout: 10_000,
      });
      return useRemoteDefaultBranch(worktreePath, branch);
    } catch {
      // no shared history or branch doesn't exist
    }
  }

  for (const branch of ['main', 'master']) {
    try {
      const r = await execFileAsync('git', ['ls-remote', '--heads', 'origin', branch], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      if (!r.stdout.trim()) continue;

      const countResult = await execFileAsync('git', [
        'rev-list', '--count', `origin/${branch}`,
      ], { cwd: worktreePath, timeout: 10_000 });
      const commitCount = parseInt(countResult.stdout.trim(), 10);

      if (commitCount > 1) {
        console.warn(
          `[worktree-git] Remote '${branch}' has ${commitCount} commits but no shared history with HEAD. ` +
          `Using it as PR base to avoid overwriting existing work.`,
        );
        return useRemoteDefaultBranch(worktreePath, branch);
      }
    } catch {
      // branch doesn't exist or fetch failed
    }
  }

  console.log('[worktree-git] Setting up remote main from feature branch root commit');
  try {
    const rootResult = await execFileAsync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: worktreePath,
      timeout: 10_000,
    });
    const rootCommit = rootResult.stdout.trim().split('\n')[0];

    if (rootCommit) {
      await execFileAsync('git', ['update-ref', 'refs/heads/main', rootCommit], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      await execFileAsync('git', ['push', '--force-with-lease', '-u', 'origin', 'main'], {
        cwd: worktreePath,
        timeout: 30_000,
      });
      await ensureGithubDefaultBranch(worktreePath, 'main');
      console.log(`[worktree-git] Created main at root commit ${rootCommit.slice(0, 12)} and pushed`);
      return 'main';
    }
  } catch (err: unknown) {
    console.error('[worktree-git] Failed to create default branch:', execError(err).message);
  }

  return 'main';
}

async function resolveDefaultBranch(worktreePath: string): Promise<string> {
  try {
    const r = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    const ref = r.stdout.trim();
    const branch = ref.split('/').pop();
    if (branch) return branch;
  } catch {
    // no remote HEAD
  }

  for (const branch of ['main', 'master']) {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', `origin/${branch}`], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      return branch;
    } catch {
      // try local branch next
    }
    try {
      await execFileAsync('git', ['rev-parse', '--verify', branch], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      return branch;
    } catch {
      // try next branch
    }
  }

  return 'main';
}

export async function createPrFromWorktree(
  worktreePath: string,
  opts: { title: string; body: string; baseBranch?: string; draft?: boolean },
): Promise<{ success: true; url: string; number: number } | { success: false; error: string }> {
  const base = opts.baseBranch ?? await resolveDefaultBranch(worktreePath);
  const args = ['pr', 'create', '--base', base, '--title', opts.title, '--body', opts.body];
  if (opts.draft) args.push('--draft');

  try {
    const result = await execFileAsync('gh', args, {
      cwd: worktreePath,
      timeout: 120_000,
    });

    const url = extractGithubPrUrl(result.stdout) ?? extractGithubPrUrl(result.stderr);
    const prNumber = url ? extractPrNumber(url) : undefined;

    if (url && prNumber) {
      console.log(`[worktree-git] Created PR #${prNumber}: ${url}`);
      return { success: true, url, number: prNumber };
    }
    return { success: true, url: result.stdout.trim(), number: 0 };
  } catch (err: unknown) {
    const { stderr, message } = execError(err);
    const errorDetail = stderr || message || 'Unknown error';

    if (errorDetail.includes('already exists')) {
      const existing = await findExistingPr(worktreePath);
      if (existing) return { success: true, ...existing };
    }

    console.error('[worktree-git] PR creation failed:', errorDetail);
    return { success: false, error: errorDetail };
  }
}

export async function mergePrFromWorktree(
  worktreePath: string,
  prNumber: number,
  opts: { method?: PullRequestMergeMethod } = {},
): Promise<PullRequestMergeResult> {
  const method = opts.method ?? 'squash';

  try {
    await execFileAsync('gh', buildMergeArgs(prNumber, method), {
      cwd: worktreePath,
      timeout: 120_000,
    });
  } catch (mergeErr: unknown) {
    const immediateError = execError(mergeErr);
    try {
      await execFileAsync('gh', buildMergeArgs(prNumber, method, true), {
        cwd: worktreePath,
        timeout: 120_000,
      });
    } catch (autoMergeErr: unknown) {
      const state = await getPullRequestMergeState(worktreePath, prNumber);
      if (state === 'merged') {
        return { success: true, state: 'merged' };
      }

      const autoMergeError = execError(autoMergeErr);
      const detail = autoMergeError.stderr || autoMergeError.message || immediateError.stderr || immediateError.message;
      console.error(`[worktree-git] PR merge failed for #${prNumber}:`, detail);
      return { success: false, error: detail };
    }
  }

  const state = await getPullRequestMergeState(worktreePath, prNumber);
  return {
    success: true,
    state: state === 'merged' ? 'merged' : 'scheduled',
  };
}

async function findExistingPr(
  worktreePath: string,
): Promise<{ url: string; number: number } | null> {
  try {
    const result = await execFileAsync('gh', [
      'pr', 'view', '--json', 'url,number',
    ], { cwd: worktreePath, timeout: 30_000 });

    const parsed = JSON.parse(result.stdout) as { url?: string; number?: number };
    if (parsed.url && typeof parsed.number === 'number') {
      return { url: parsed.url, number: parsed.number };
    }
  } catch {
    // no existing PR
  }
  return null;
}

function extractGithubPrUrl(text: string): string | undefined {
  return text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
}

function extractPrNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function buildMergeArgs(
  prNumber: number,
  method: PullRequestMergeMethod,
  auto = false,
): string[] {
  const args = ['pr', 'merge', String(prNumber), '--delete-branch'];
  if (auto) args.push('--auto');
  if (method === 'merge') args.push('--merge');
  if (method === 'rebase') args.push('--rebase');
  if (method === 'squash') args.push('--squash');
  return args;
}
