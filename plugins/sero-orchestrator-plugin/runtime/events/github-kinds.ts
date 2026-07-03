/**
 * GitHub event kind catalog and occurrence extraction (spec 12 Phase 4).
 *
 * Six kinds map onto four repo-wide list endpoints so demand scoping stays
 * coarse and cheap: no checks/actions traffic exists unless a `ci-*`
 * subscription does. Extraction is cursor-based per kind — the first poll for
 * a kind establishes a baseline and emits nothing (subscribing must not replay
 * repo history); later polls emit only items newer than the cursor, oldest
 * first, each with a `dedupeKey` from the stable GitHub id so the
 * coordinator's dedupe ring backstops any cursor boundary overlap.
 */

import type { EventSubscription } from './types';

export type GithubKind =
  | 'pr-opened'
  | 'ci-failed'
  | 'ci-passed'
  | 'issue-labelled'
  | 'review-requested'
  | 'review-comment';

const ALL_KINDS: readonly string[] = [
  'pr-opened',
  'ci-failed',
  'ci-passed',
  'issue-labelled',
  'review-requested',
  'review-comment',
];

export interface GithubEndpoint {
  id: string;
  /** `gh api` path; `{owner}/{repo}` resolves from the workspace remote. */
  path: string;
  kinds: GithubKind[];
}

export const GITHUB_ENDPOINTS: GithubEndpoint[] = [
  {
    id: 'pulls',
    path: 'repos/{owner}/{repo}/pulls?state=open&sort=created&direction=desc&per_page=30',
    kinds: ['pr-opened'],
  },
  {
    id: 'workflow-runs',
    path: 'repos/{owner}/{repo}/actions/runs?status=completed&per_page=30',
    kinds: ['ci-failed', 'ci-passed'],
  },
  {
    id: 'issue-events',
    path: 'repos/{owner}/{repo}/issues/events?per_page=30',
    kinds: ['issue-labelled', 'review-requested'],
  },
  {
    id: 'review-comments',
    path: 'repos/{owner}/{repo}/pulls/comments?sort=created&direction=desc&per_page=30',
    kinds: ['review-comment'],
  },
];

/** The kinds live subscriptions demand; unknown `github:*` sources are reported, not polled. */
export function demandedKinds(subscriptions: EventSubscription[]): { kinds: Set<GithubKind>; unknown: string[] } {
  const kinds = new Set<GithubKind>();
  const unknown: string[] = [];
  for (const subscription of subscriptions) {
    const kind = subscription.eventSource.slice('github:'.length);
    if (ALL_KINDS.includes(kind)) kinds.add(kind as GithubKind);
    else if (!unknown.includes(subscription.eventSource)) unknown.push(subscription.eventSource);
  }
  return { kinds, unknown };
}

export function endpointsForKinds(kinds: Set<GithubKind>): GithubEndpoint[] {
  return GITHUB_ENDPOINTS.filter((endpoint) => endpoint.kinds.some((kind) => kinds.has(kind)));
}

export interface GithubOccurrence {
  kind: GithubKind;
  occurredAt: string;
  dedupeKey: string;
  summary: string;
  payload: Record<string, unknown>;
}

/** One raw endpoint item mapped to a kind, before cursor filtering. */
interface Candidate extends Omit<GithubOccurrence, 'dedupeKey'> {
  id: string;
}

// Minimal shapes of the GitHub list payloads — only the fields read here.
interface GhUser {
  login?: string;
}
interface GhPull {
  id?: number;
  number?: number;
  title?: string;
  created_at?: string;
  html_url?: string;
  draft?: boolean;
  user?: GhUser;
  head?: { ref?: string };
  base?: { ref?: string };
}
interface GhWorkflowRun {
  id?: number;
  run_attempt?: number;
  name?: string;
  conclusion?: string | null;
  head_branch?: string;
  head_sha?: string;
  html_url?: string;
  updated_at?: string;
  pull_requests?: { number?: number }[];
}
interface GhIssueEvent {
  id?: number;
  event?: string;
  created_at?: string;
  label?: { name?: string };
  requested_reviewer?: GhUser;
  issue?: { number?: number; title?: string; html_url?: string; pull_request?: unknown };
}
interface GhReviewComment {
  id?: number;
  created_at?: string;
  body?: string;
  path?: string;
  html_url?: string;
  user?: GhUser;
  pull_request_url?: string;
}

const CI_FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

function asArray<T>(body: unknown, key?: string): T[] {
  const items = key && typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : body;
  return Array.isArray(items) ? (items as T[]) : [];
}

function pullCandidates(body: unknown): Candidate[] {
  const candidates: Candidate[] = [];
  for (const pull of asArray<GhPull>(body)) {
    if (!pull?.created_at || pull.id === undefined) continue;
    candidates.push({
      kind: 'pr-opened',
      occurredAt: pull.created_at,
      id: String(pull.id),
      summary: `PR #${pull.number} opened: ${pull.title ?? ''}`.trim(),
      payload: {
        number: pull.number,
        title: pull.title,
        author: pull.user?.login,
        branch: pull.head?.ref,
        baseBranch: pull.base?.ref,
        url: pull.html_url,
        draft: pull.draft ?? false,
      },
    });
  }
  return candidates;
}

function workflowRunCandidates(body: unknown): Candidate[] {
  const candidates: Candidate[] = [];
  for (const run of asArray<GhWorkflowRun>(body, 'workflow_runs')) {
    if (!run?.updated_at || run.id === undefined || !run.conclusion) continue;
    const kind = run.conclusion === 'success' ? 'ci-passed' : CI_FAILURE_CONCLUSIONS.has(run.conclusion) ? 'ci-failed' : null;
    if (!kind) continue;
    candidates.push({
      kind,
      occurredAt: run.updated_at,
      id: `${run.id}:${run.run_attempt ?? 1}`,
      summary: `CI ${kind === 'ci-passed' ? 'passed' : 'failed'} on ${run.head_branch ?? 'unknown branch'}: ${run.name ?? 'workflow'}`,
      payload: {
        workflow: run.name,
        conclusion: run.conclusion,
        branch: run.head_branch,
        sha: run.head_sha,
        url: run.html_url,
        prNumbers: run.pull_requests?.map((pull) => pull.number).filter((n) => n !== undefined) ?? [],
      },
    });
  }
  return candidates;
}

function issueEventCandidates(body: unknown): Candidate[] {
  const candidates: Candidate[] = [];
  for (const entry of asArray<GhIssueEvent>(body)) {
    if (!entry?.created_at || entry.id === undefined) continue;
    const shared = { occurredAt: entry.created_at, id: String(entry.id) };
    if (entry.event === 'labeled') {
      candidates.push({
        ...shared,
        kind: 'issue-labelled',
        summary: `${entry.issue?.pull_request ? 'PR' : 'Issue'} #${entry.issue?.number} labelled "${entry.label?.name ?? ''}"`,
        payload: {
          issueNumber: entry.issue?.number,
          issueTitle: entry.issue?.title,
          label: entry.label?.name,
          url: entry.issue?.html_url,
          isPullRequest: Boolean(entry.issue?.pull_request),
        },
      });
    } else if (entry.event === 'review_requested') {
      candidates.push({
        ...shared,
        kind: 'review-requested',
        summary: `Review requested on PR #${entry.issue?.number}: ${entry.issue?.title ?? ''}`.trim(),
        payload: {
          prNumber: entry.issue?.number,
          prTitle: entry.issue?.title,
          requestedReviewer: entry.requested_reviewer?.login,
          url: entry.issue?.html_url,
        },
      });
    }
  }
  return candidates;
}

function reviewCommentCandidates(body: unknown): Candidate[] {
  const candidates: Candidate[] = [];
  for (const comment of asArray<GhReviewComment>(body)) {
    if (!comment?.created_at || comment.id === undefined) continue;
    const prNumber = Number(comment.pull_request_url?.split('/').at(-1)) || undefined;
    candidates.push({
      kind: 'review-comment',
      occurredAt: comment.created_at,
      id: String(comment.id),
      summary: `Review comment on PR #${prNumber} by ${comment.user?.login ?? 'unknown'}`,
      payload: {
        prNumber,
        author: comment.user?.login,
        path: comment.path,
        excerpt: comment.body?.slice(0, 400),
        url: comment.html_url,
      },
    });
  }
  return candidates;
}

const CANDIDATE_EXTRACTORS: Record<string, (body: unknown) => Candidate[]> = {
  pulls: pullCandidates,
  'workflow-runs': workflowRunCandidates,
  'issue-events': issueEventCandidates,
  'review-comments': reviewCommentCandidates,
};

/**
 * Cursor-filters one endpoint's body into occurrences for the demanded kinds
 * and returns the advanced cursors. ISO timestamps compare lexicographically.
 */
export function extractOccurrences(
  endpoint: GithubEndpoint,
  body: unknown,
  demanded: Set<GithubKind>,
  cursors: Record<string, string>,
  nowIso: string,
): { occurrences: GithubOccurrence[]; cursors: Record<string, string> } {
  const candidates = CANDIDATE_EXTRACTORS[endpoint.id]?.(body) ?? [];
  const next = { ...cursors };
  const occurrences: GithubOccurrence[] = [];
  for (const kind of endpoint.kinds) {
    if (!demanded.has(kind)) continue;
    const items = candidates.filter((candidate) => candidate.kind === kind);
    const known = next[kind];
    const newest = items.reduce((max, item) => (item.occurredAt > max ? item.occurredAt : max), known ?? '');
    if (!known) {
      next[kind] = newest || nowIso;
      continue;
    }
    const fresh = items
      .filter((item) => item.occurredAt > known)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (const item of fresh) {
      occurrences.push({
        kind,
        occurredAt: item.occurredAt,
        dedupeKey: `github:${kind}:${item.id}`,
        summary: item.summary,
        payload: item.payload,
      });
    }
    next[kind] = newest;
  }
  return { occurrences, cursors: next };
}
