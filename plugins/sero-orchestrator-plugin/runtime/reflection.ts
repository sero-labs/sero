// The reflector (the redefined P-E) — a read-only LLM critic that looks at a
// loop's real history and assesses its health, separate from the loop trying to
// pass its own criteria. ADVISORY ONLY: it returns data; the coordinator stores
// it and notifies, and the user acts via edit / replan / resume. The reflector
// never rewrites the plan or changes control state, which structurally avoids the
// "weaken the criteria to win" hole that auto-re-planning would have had.
//
// Same read-only seam as the judge (D-16): no `sero-cli`, cannot recurse.

import type { AppRuntimeHost } from '@sero-ai/common';

import type {
  LoopAttempt,
  LoopGoal,
  LoopReflection,
  ReflectionTrigger,
  ReflectionVerdict,
} from '../shared/types';
import { lastFencedJsonBlock, toolPolicyForRole } from './workers';

/** What the reflector returns; the caller stamps `trigger` + `at`. */
export interface ReflectionResult {
  verdict: ReflectionVerdict;
  summary: string;
  suggestion?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: number };
}

/** Stamp a reflector result into a stored {@link LoopReflection}. */
export function toReflection(
  result: ReflectionResult,
  trigger: ReflectionTrigger,
  at: string,
): LoopReflection {
  return {
    verdict: result.verdict,
    summary: result.summary,
    suggestion: result.suggestion,
    trigger,
    at,
    model: result.model,
    usage: result.usage,
  };
}

/** Reflects on one loop; injected into the engine + the health check. */
export type Reflector = (loop: LoopGoal, trigger: ReflectionTrigger) => Promise<ReflectionResult | null>;

export interface ReflectorDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
}

const VERDICTS: ReadonlyArray<ReflectionVerdict> = [
  'healthy',
  'stuck',
  'plan-mismatch',
  'suspicious-completion',
  'needs-attention',
];

const REFLECTION_SYSTEM_PROMPT = [
  'You are a reflective reviewer for a Sero Orchestrator loop. A loop pursues a',
  'plain-English goal by repeatedly making changes and verifying them against',
  'LLM-authored success criteria. You are READ-ONLY and ADVISORY: you do not change',
  'anything — you assess and suggest.',
  '',
  'Given the goal, the verification plan, and the recent run history, judge honestly:',
  '- healthy: progressing well, or finished cleanly.',
  '- stuck: not making progress; likely needs a human nudge.',
  '- plan-mismatch: the way it verifies success looks wrong for the goal.',
  '- suspicious-completion: it "passed", but the evidence looks thin.',
  '- needs-attention: anything else worth surfacing.',
  '',
  'Be specific and concise. Suggest at most ONE next step in plain English (e.g.',
  're-derive the plan, clarify the goal, approve it, or nothing needed).',
  '',
  'End your reply with a single fenced JSON block and nothing after it:',
  '```json',
  '{ "verdict": "healthy | stuck | plan-mismatch | suspicious-completion | needs-attention",',
  '  "summary": "<one or two sentences>",',
  '  "suggestion": "<optional one-line next step>" }',
  '```',
].join('\n');

/** Create the reflector the engine + health check invoke. */
export function createReflector(deps: ReflectorDeps): Reflector {
  return async (loop, trigger) => {
    const result = await deps.host.subagents.runStructured({
      task: buildReflectionTask(loop, trigger),
      systemPrompt: REFLECTION_SYSTEM_PROMPT,
      platformTools: toolPolicyForRole('reviewer'), // readOnly → cannot recurse
      parentSessionId: loop.sessionId ?? `orchestrator:${loop.id}`,
      workspaceId: deps.workspaceId,
      cwd: deps.cwd,
    });
    if (result.error) return null;
    const parsed = parseReflection(result.response);
    if (!parsed) return null;
    return { ...parsed, model: result.modelId, usage: result.usage };
  };
}

function buildReflectionTask(loop: LoopGoal, trigger: ReflectionTrigger): string {
  const sections: string[] = [
    `# Goal: ${loop.title}`,
    loop.goal,
    [
      '## Loop state',
      `Status: ${loop.status}${loop.statusReason ? ` — ${loop.statusReason}` : ''}`,
      `Reflection trigger: ${trigger}`,
    ].join('\n'),
  ];
  if (loop.verificationPlan?.criteria.length) {
    sections.push(
      [
        '## Success criteria',
        ...loop.verificationPlan.criteria.map(
          (c) => `- ${c.description} [${c.decision.kind}${c.required ? ', required' : ''}]`,
        ),
      ].join('\n'),
    );
  }
  const recent = loop.attempts.slice(-3);
  sections.push(
    recent.length
      ? ['## Recent attempts', ...recent.map(describeAttempt)].join('\n')
      : '## Recent attempts\n(none yet)',
  );
  return sections.filter(Boolean).join('\n\n');
}

function describeAttempt(attempt: LoopAttempt): string {
  const parts = [`- attempt ${attempt.attemptNumber}: ${attempt.status}`];
  if (attempt.learned) parts.push(`  learned: ${tail(attempt.learned, 300)}`);
  const failing = attempt.checkResults.filter((r) => r.status === 'failed').map((r) => r.checkId);
  if (failing.length) parts.push(`  failing: ${failing.join(', ')}`);
  if (attempt.changedFiles.length) parts.push(`  changed: ${attempt.changedFiles.length} file(s)`);
  return parts.join('\n');
}

export interface ParsedReflection {
  verdict: ReflectionVerdict;
  summary: string;
  suggestion?: string;
}

/** Extract and validate a reflection verdict from the critic's fenced JSON. */
export function parseReflection(response: string): ParsedReflection | null {
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
  const verdict = VERDICTS.find((value) => value === record.verdict);
  const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
  if (!verdict || !summary) return null;
  return {
    verdict,
    summary,
    suggestion: typeof record.suggestion === 'string' && record.suggestion.trim()
      ? record.suggestion.trim()
      : undefined,
  };
}

function tail(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(text.length - max)}`;
}
