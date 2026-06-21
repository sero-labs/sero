// The criterion-judge (spec 05 §6.3) — the generalized form of reviewers.ts. A
// read-only judge subagent is given ONE success criterion and the evidence
// gathered for it, and returns a pass/fail verdict with a rationale. It runs with
// `platformTools: 'readOnly'` so it has no `sero-cli` surface and cannot recurse
// (D-16) — exactly like the legacy reviewers, which now share this module's
// verdict parser. The failing criterion + rationale feed the next attempt's
// context (sharper retries than a binary review).

import type { AppRuntimeHost } from '@sero-ai/common';

import type { LoopGoal, SuccessCriterion } from '../shared/types';
import { formatEvidence, type GatheredEvidence } from './evidence';
import { lastFencedJsonBlock, toolPolicyForRole } from './workers';

/** A raw judge verdict; criteria.ts normalizes it into a CheckResult (D-12). */
export interface JudgeVerdict {
  passed: boolean;
  summary: string;
  /** Full judge reply, retained to an artifact when oversized (D-14). */
  response: string;
}

/** Judges one criterion against its gathered evidence; injected into criteria.ts. */
export type CriterionJudge = (
  criterion: SuccessCriterion,
  evidence: GatheredEvidence,
) => Promise<JudgeVerdict>;

export interface CriterionJudgeDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
  parentSessionId: string;
  loop: LoopGoal;
}

/** Build the criterion-judge the attempt-runner injects into runCriteria. */
export function createCriterionJudge(deps: CriterionJudgeDeps): CriterionJudge {
  return async (criterion, evidence) => {
    const result = await deps.host.subagents.runStructured({
      task: buildJudgeTask(deps.loop, criterion, evidence),
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      platformTools: toolPolicyForRole('reviewer'), // readOnly → cannot recurse
      parentSessionId: deps.parentSessionId,
      workspaceId: deps.workspaceId,
      cwd: deps.cwd,
    });
    const verdict = parseVerdict(result.response);
    return {
      // No parseable verdict, or the subagent errored → treat as a failed
      // criterion with the raw text retained, rather than silently passing.
      passed: verdict?.verdict === 'pass' && !result.error,
      summary: verdict?.summary ?? result.error ?? 'Judge returned no verdict.',
      response: result.response,
    };
  };
}

const JUDGE_SYSTEM_PROMPT = [
  'You are a verification judge for a Sero Orchestrator loop. You have read-only access.',
  'You are given ONE success criterion and the evidence gathered for it. Decide whether',
  'the criterion is satisfied, based only on that evidence and the goal. Be strict and',
  'concise; do not edit anything.',
  '',
  'End your reply with a single fenced JSON block and nothing after it:',
  '```json',
  '{ "verdict": "pass | fail", "summary": "<one line>" }',
  '```',
].join('\n');

function buildJudgeTask(
  loop: LoopGoal,
  criterion: SuccessCriterion,
  evidence: GatheredEvidence,
): string {
  const rubric = criterion.decision.kind === 'judge' ? `Rubric: ${criterion.decision.rubric}` : '';
  return [
    `# Goal: ${loop.title}`,
    loop.goal,
    '## Criterion to judge',
    criterion.description,
    rubric,
    '## Evidence',
    formatEvidence(evidence),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface ParsedVerdict {
  verdict: 'pass' | 'fail';
  summary?: string;
}

/** Extract a `{ verdict, summary }` from a judge/reviewer reply (shared, D-08). */
export function parseVerdict(response: string): ParsedVerdict | null {
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
