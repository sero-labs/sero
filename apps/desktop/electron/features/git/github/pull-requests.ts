/**
 * Pull request and issue operations — each implemented exactly once over a
 * GhInvoker, so workspace-routed and path-addressed callers share the same
 * behaviour and auth posture.
 */

import type { CreatePullRequestResult } from '@sero-ai/common';
import type { GhInvoker } from './invoker';
import { extractGithubPrUrl, extractPrNumber, formatGhFailure, ghError } from './helpers';
import { getPullRequestMergeState } from './merge-state';

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export type PullRequestMergeResult =
  | { success: true; state: 'merged' | 'scheduled' }
  | { success: false; error: string };

export interface CreatePullRequestOptions {
  /** Source branch; omitted → gh infers from the repo's current branch. */
  head?: string;
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

/** The one `gh pr create` call site. */
export async function createPullRequest(
  gh: GhInvoker,
  options: CreatePullRequestOptions,
): Promise<CreatePullRequestResult> {
  const args = ['pr', 'create'];
  if (options.head) args.push('--head', options.head);
  args.push('--base', options.base, '--title', options.title, '--body', options.body);
  if (options.draft) args.push('--draft');

  try {
    const result = await gh(args, 120_000);
    const url = extractGithubPrUrl(result.stdout) ?? extractGithubPrUrl(result.stderr);
    return {
      success: true,
      message: url ? `Pull request created: ${url}` : 'Pull request created successfully.',
      url,
      number: url ? extractPrNumber(url) : undefined,
    };
  } catch (err) {
    return { success: false, message: formatGhFailure(err, 'Failed to create pull request') };
  }
}

export interface PullRequestSummaryRef {
  url: string;
  number: number;
  title: string;
  baseBranch: string;
}

/** Find the open PR for a head/base branch pair, if any. */
export async function findOpenPullRequest(
  gh: GhInvoker,
  head: string,
  base: string,
): Promise<PullRequestSummaryRef | undefined> {
  try {
    const result = await gh(
      ['pr', 'list', '--head', head, '--base', base, '--state', 'open',
        '--limit', '1', '--json', 'url,number,title,baseRefName'],
      60_000,
    );
    if (!result.stdout.trim()) return undefined;
    const parsed = JSON.parse(result.stdout) as Array<{
      url?: string;
      number?: number;
      title?: string;
      baseRefName?: string;
    }>;
    const first = parsed[0];
    if (!first?.url || typeof first.number !== 'number' || !first.title) return undefined;
    return {
      url: first.url,
      number: first.number,
      title: first.title,
      baseBranch: first.baseRefName ?? base,
    };
  } catch {
    return undefined;
  }
}

/** The PR associated with the repo's current branch (gh pr view), if any. */
export async function viewCurrentPullRequest(
  gh: GhInvoker,
): Promise<{ url: string; number: number } | null> {
  try {
    const result = await gh(['pr', 'view', '--json', 'url,number'], 30_000);
    const parsed = JSON.parse(result.stdout) as { url?: string; number?: number };
    if (parsed.url && typeof parsed.number === 'number') {
      return { url: parsed.url, number: parsed.number };
    }
  } catch {
    // no existing PR
  }
  return null;
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
 * Lists open pull requests. Fail-soft to `[]` (no remote, no PRs); a missing
 * or unauthenticated gh is logged distinctly so the empty list is diagnosable.
 */
export async function listOpenPullRequests(
  gh: GhInvoker,
  opts: { author?: string } = {},
): Promise<OpenPullRequestSummary[]> {
  const args = ['pr', 'list', '--state', 'open',
    '--json', 'number,url,title,headRefName,updatedAt,body'];
  if (opts.author) args.push('--author', opts.author);
  try {
    const r = await gh(args, 30_000);
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
 * Lists open issues — the twin of `listOpenPullRequests`. gh returns
 * labels/assignees as objects; they are flattened to names here.
 */
export async function listOpenIssues(gh: GhInvoker): Promise<OpenIssueSummary[]> {
  // Explicit cap (gh defaults to a silent 30): the board renders at most a
  // screenful of backlog issues, and gh returns the most recently updated first.
  const args = ['issue', 'list', '--state', 'open', '--limit', '50',
    '--json', 'number,url,title,labels,assignees,updatedAt'];
  try {
    const r = await gh(args, 30_000);
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

/**
 * Merge a PR: try an immediate merge, fall back to GitHub auto-merge, and
 * treat "already merged meanwhile" as success.
 */
export async function mergePullRequest(
  gh: GhInvoker,
  prNumber: number,
  opts: { method?: PullRequestMergeMethod } = {},
): Promise<PullRequestMergeResult> {
  const method = opts.method ?? 'squash';

  try {
    await gh(buildMergeArgs(prNumber, method), 120_000);
  } catch (mergeErr) {
    const immediateError = ghError(mergeErr);
    try {
      await gh(buildMergeArgs(prNumber, method, true), 120_000);
    } catch (autoMergeErr) {
      const state = await getPullRequestMergeState(gh, prNumber);
      if (state === 'merged') {
        return { success: true, state: 'merged' };
      }

      const autoMergeError = ghError(autoMergeErr);
      const detail = autoMergeError.stderr || autoMergeError.message
        || immediateError.stderr || immediateError.message;
      console.error(`[github] PR merge failed for #${prNumber}:`, detail);
      return { success: false, error: detail };
    }
  }

  const state = await getPullRequestMergeState(gh, prNumber);
  return {
    success: true,
    state: state === 'merged' ? 'merged' : 'scheduled',
  };
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

/**
 * gh reads fail soft to `[]`, which makes a missing or logged-out `gh` look
 * like "no PRs/issues". Distinguish those causes in the log so the empty
 * board is diagnosable.
 */
function warnGhReadFailure(op: string, err: unknown): void {
  const { stderr, message } = ghError(err);
  const detail = (stderr || message).slice(0, 200);
  const code = (err as { code?: string })?.code;
  if (code === 'ENOENT') {
    console.warn(`[github] gh ${op}: gh CLI not found — returning empty list`);
  } else if (/auth|login|credentials|401|403/i.test(detail)) {
    console.warn(`[github] gh ${op}: not authenticated — returning empty list:`, detail);
  } else {
    console.warn(`[github] gh ${op} failed — returning empty list:`, detail);
  }
}
