// Pull-request flow (Phase 6, FR-21). When a worktree-isolated loop completes
// and opted in (`prPolicy.openOnComplete`), the coordinator pushes the loop's
// branch and opens a PR with a title/body generated deterministically from loop
// data — no extra LLM round-trip, the content is all known structured facts.
//
// Opt-in open only; merging stays a manual user action (Dan's call). `mergePr`
// and `getPrMergeState` are wired so a later surface can drive/report a merge,
// but nothing here merges automatically.

import type { AppRuntimeHost } from '@sero-ai/common';

import type {
  CheckResult,
  LoopAttempt,
  LoopGoal,
  PullRequestRef,
  PullRequestState,
} from '../shared/types';
import { isoNow, type Clock } from './clock';

export interface PrDeps {
  host: AppRuntimeHost;
  clock: Clock;
}

export type OpenPrOutcome =
  | { ok: true; ref: PullRequestRef }
  | { ok: false; reason: string };

/**
 * Push the loop's worktree branch and open a PR. The loop must already own a
 * worktree (only worktree loops have an isolated branch to propose). Returns a
 * recordable {@link PullRequestRef} on success.
 */
export async function openPullRequestForLoop(deps: PrDeps, loop: LoopGoal): Promise<OpenPrOutcome> {
  const worktree = loop.worktree;
  if (!worktree) return { ok: false, reason: 'no worktree branch to open a PR from' };

  const pushed = await deps.host.git.pushBranch(worktree.path, worktree.branch);
  if (!pushed) return { ok: false, reason: `could not push branch ${worktree.branch}` };

  const { title, body } = buildPrContent(loop);
  const result = await deps.host.git.createPr(worktree.path, {
    title,
    body,
    baseBranch: loop.prPolicy?.baseBranch,
    draft: loop.prPolicy?.draft,
  });
  if (!result.success) return { ok: false, reason: result.error };

  return {
    ok: true,
    ref: {
      number: result.number,
      url: result.url,
      state: 'open',
      branch: worktree.branch,
      openedAt: isoNow(deps.clock),
    },
  };
}

/** Read the live merge state of the loop's PR (status display). */
export async function getLoopPrState(host: AppRuntimeHost, loop: LoopGoal): Promise<PullRequestState> {
  if (!loop.pullRequest || !loop.worktree) return 'unknown';
  return host.git.getPrMergeState(loop.worktree.path, loop.pullRequest.number);
}

/**
 * Merge the loop's PR — a manual action, never auto-invoked in Phase 6. Returns
 * the resulting state, or null when there is no PR / the merge fails.
 */
export async function mergeLoopPr(
  host: AppRuntimeHost,
  loop: LoopGoal,
  method?: 'merge' | 'squash' | 'rebase',
): Promise<'merged' | 'scheduled' | null> {
  if (!loop.pullRequest || !loop.worktree) return null;
  const result = await host.git.mergePr(loop.worktree.path, loop.pullRequest.number, { method });
  return result.success ? result.state : null;
}

/** Generate the PR title and body from the loop's known facts (deterministic). */
export function buildPrContent(loop: LoopGoal): { title: string; body: string } {
  const finished = lastPassingAttempt(loop) ?? loop.attempts.at(-1);
  const attemptCount = loop.attempts.length;
  const branch = loop.worktree?.branch ?? '(unknown)';

  const lines = [
    '## Goal',
    loop.goal,
    '',
    '## Result',
    `Completed in ${attemptCount} attempt${attemptCount === 1 ? '' : 's'} on branch \`${branch}\`.`,
  ];

  const checks = finished?.checkResults ?? [];
  if (checks.length) {
    lines.push('', '## Checks', ...checks.map(formatCheckLine));
  }

  const files = finished?.changedFiles ?? [];
  if (files.length) {
    lines.push('', '## Files changed', ...files.map((file) => `- \`${file}\``));
  }

  lines.push('', '---', '_Opened automatically by Sero Orchestrator._');
  return { title: loop.title, body: lines.join('\n') };
}

function formatCheckLine(check: CheckResult): string {
  const mark = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : '⚪️';
  const label = check.command ?? check.type;
  return `- ${mark} \`${label}\``;
}

function lastPassingAttempt(loop: LoopGoal): LoopAttempt | undefined {
  for (let i = loop.attempts.length - 1; i >= 0; i -= 1) {
    if (loop.attempts[i].status === 'passed') return loop.attempts[i];
  }
  return undefined;
}
