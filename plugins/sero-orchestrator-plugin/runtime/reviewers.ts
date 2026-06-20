// Reviewer workers (D-10) — optional post-pass checks. A `review` LoopCheck runs
// a read-only reviewer subagent that judges the attempt's changes against the
// goal and reports a verdict. Reviewers run with `platformTools: 'readOnly'`, so
// they have no `sero-cli` surface and cannot recurse into the orchestrator —
// the recursion guard (D-16) is only needed for the `implementer` worker.
//
// checks.ts stays the single CheckResult normalizer: this module returns a raw
// {passed, summary, response} verdict and checks.ts maps it to a CheckResult.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { LoopGoal, ReviewerKind } from '../shared/types';
import { lastFencedJsonBlock, toolPolicyForRole } from './workers';

/** A raw reviewer verdict; checks.ts normalizes it into a CheckResult. */
export interface ReviewVerdict {
  passed: boolean;
  summary: string;
  /** Full reviewer reply, retained to an artifact when oversized (D-14). */
  response: string;
}

/** Runs one review check; returned to checks.ts via injection. */
export type ReviewerRunner = (kind: ReviewerKind) => Promise<ReviewVerdict>;

export interface ReviewerRunnerDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
  parentSessionId: string;
  loop: LoopGoal;
}

/** Build the reviewer runner the attempt-runner injects into runChecks. */
export function createReviewerRunner(deps: ReviewerRunnerDeps): ReviewerRunner {
  return async (kind) => {
    const diffSummary = await safeDiffSummary(deps.host, deps.cwd);
    const result = await deps.host.subagents.runStructured({
      task: buildReviewerTask(deps.loop, diffSummary),
      systemPrompt: systemPromptFor(kind),
      platformTools: toolPolicyForRole('reviewer'),
      parentSessionId: deps.parentSessionId,
      workspaceId: deps.workspaceId,
      cwd: deps.cwd,
    });
    const verdict = parseVerdict(result.response);
    return {
      // No parseable verdict, or the subagent errored → treat as a failed review
      // with the raw text retained, rather than silently passing.
      passed: verdict?.verdict === 'pass' && !result.error,
      summary: verdict?.summary ?? (result.error ?? 'Reviewer returned no verdict.'),
      response: result.response,
    };
  };
}

function systemPromptFor(kind: ReviewerKind): string {
  const focus =
    kind === 'spec-reviewer'
      ? 'Judge whether the changes actually satisfy the goal and its acceptance criteria. Flag missing or incomplete work.'
      : 'Judge code quality: correctness, simplicity, and obvious bugs or regressions. Flag risky or low-quality changes.';
  return [
    `You are the ${kind} for a Sero Orchestrator loop. You have read-only access.`,
    focus,
    'Do not edit anything. Be concise.',
    '',
    'End your reply with a single fenced JSON block and nothing after it:',
    '```json',
    '{ "verdict": "pass | fail", "summary": "<one line>", "issues": ["<optional>"] }',
    '```',
  ].join('\n');
}

function buildReviewerTask(loop: LoopGoal, diffSummary: string): string {
  return [
    `# Goal: ${loop.title}`,
    loop.goal,
    '## Changes to review',
    diffSummary || '(no diff reported)',
  ].join('\n\n');
}

async function safeDiffSummary(host: AppRuntimeHost, cwd: string): Promise<string> {
  const summary = await host.git.getDiffSummary(cwd);
  return summary.trim();
}

interface ParsedVerdict {
  verdict: 'pass' | 'fail';
  summary?: string;
}

function parseVerdict(response: string): ParsedVerdict | null {
  const raw = lastFencedJsonBlock(response);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const verdict = record.verdict === 'pass' ? 'pass' : record.verdict === 'fail' ? 'fail' : null;
  if (!verdict) return null;
  return { verdict, summary: typeof record.summary === 'string' ? record.summary : undefined };
}
