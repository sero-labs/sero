import { execWorktreeGit, execWorktreeGh } from './exec';
import { getPullRequestMergeState } from './merge-status';

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

/**
 * gh reads fail soft to `[]`, which makes a missing or logged-out `gh` look
 * like "no PRs/issues". Distinguish those causes in the log so the empty
 * board is diagnosable.
 */
function warnGhReadFailure(op: string, err: unknown): void {
  const { stderr, message } = execError(err);
  const detail = (stderr || message).slice(0, 200);
  const code = (err as { code?: string })?.code;
  if (code === 'ENOENT') {
    console.warn(`[worktree-pr] gh ${op}: gh CLI not found — returning empty list`);
  } else if (/auth|login|credentials|401|403/i.test(detail)) {
    console.warn(`[worktree-pr] gh ${op}: not authenticated — returning empty list:`, detail);
  } else {
    console.warn(`[worktree-pr] gh ${op} failed — returning empty list:`, detail);
  }
}

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

async function getGithubDefaultBranch(worktreePath: string): Promise<string | null> {
  try {
    const result = await execWorktreeGh([
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
    await execWorktreeGit(['remote', 'set-head', 'origin', branch], {
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

    await execWorktreeGh(['repo', 'edit', '--default-branch', branch], {
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
    console.error('[worktree-git] Failed to create default branch:', execError(err).message);
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

export interface OpenPullRequestSummary {
  number: number;
  url: string;
  title: string;
  headRefName: string;
  updatedAt: string;
  body?: string;
}

/**
 * Lists open pull requests in `cwd`'s repo via `gh`. Repo-scoped, so it works
 * before any worktree exists. Fail-soft to `[]` (no `gh`, no remote, no PRs),
 * exactly like the sibling helpers.
 */
export async function listOpenPullRequests(
  cwd: string,
  opts: { author?: string } = {},
): Promise<OpenPullRequestSummary[]> {
  const args = ['pr', 'list', '--state', 'open',
    '--json', 'number,url,title,headRefName,updatedAt,body'];
  if (opts.author) args.push('--author', opts.author);
  try {
    const r = await execWorktreeGh(args, { cwd, timeout: 30_000 });
    const parsed = JSON.parse(r.stdout) as OpenPullRequestSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    warnGhReadFailure('pr list', err);
    return [];
  }
}

export interface OpenIssueSummary {
  number: number;
  url: string;
  title: string;
  labels: string[];
  assignees: string[];
  updatedAt: string;
}

/**
 * Lists open issues in `cwd`'s repo via `gh` — the twin of `listOpenPullRequests`.
 * `gh` returns labels/assignees as objects; they are flattened to names here so
 * consumers get plain strings. Fail-soft to `[]` like the sibling helpers.
 */
export async function listOpenIssues(cwd: string): Promise<OpenIssueSummary[]> {
  // Explicit cap (gh defaults to a silent 30): the board renders at most a
  // screenful of backlog issues, and gh returns the most recently updated first.
  const args = ['issue', 'list', '--state', 'open', '--limit', '50',
    '--json', 'number,url,title,labels,assignees,updatedAt'];
  try {
    const r = await execWorktreeGh(args, { cwd, timeout: 30_000 });
    const parsed = JSON.parse(r.stdout) as Array<{
      number: number;
      url: string;
      title: string;
      labels?: Array<{ name?: string }>;
      assignees?: Array<{ login?: string }>;
      updatedAt: string;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((issue) => ({
      number: issue.number,
      url: issue.url,
      title: issue.title,
      labels: (issue.labels ?? []).flatMap((label) => label.name ? [label.name] : []),
      assignees: (issue.assignees ?? []).flatMap((assignee) => assignee.login ? [assignee.login] : []),
      updatedAt: issue.updatedAt,
    }));
  } catch (err) {
    warnGhReadFailure('issue list', err);
    return [];
  }
}

export async function createPrFromWorktree(
  worktreePath: string,
  opts: { title: string; body: string; baseBranch?: string; draft?: boolean },
): Promise<{ success: true; url: string; number: number } | { success: false; error: string }> {
  const base = opts.baseBranch ?? await resolveDefaultBranch(worktreePath);
  const args = ['pr', 'create', '--base', base, '--title', opts.title, '--body', opts.body];
  if (opts.draft) args.push('--draft');

  try {
    const result = await execWorktreeGh(args, {
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
    await execWorktreeGh(buildMergeArgs(prNumber, method), {
      cwd: worktreePath,
      timeout: 120_000,
    });
  } catch (mergeErr: unknown) {
    const immediateError = execError(mergeErr);
    try {
      await execWorktreeGh(buildMergeArgs(prNumber, method, true), {
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
    const result = await execWorktreeGh([
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
