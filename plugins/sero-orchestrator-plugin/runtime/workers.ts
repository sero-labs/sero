// Generated-worker contract (D-08, D-10). Each attempt builds a full
// WorkerInstruction from the goal, the active task, prior failures, the check
// output, the changed files so far, and the stop rule — not just an agent name.
//
// Subagents do NOT validate an output schema (02 §Subagents): the system prompt
// asks the worker to end its reply with a fenced JSON block, and the coordinator
// parses it (`parseWorkerOutput`). A parse failure is a soft attempt failure
// with the raw text retained (the adapter writes it to an artifact). The worker
// never carries the working directory — the coordinator derives `cwd` from the
// canonical `LoopAttempt.workdir.cwd` (D-06).

import type {
  CheckResult,
  LoopAttempt,
  LoopGoal,
  LoopTask,
  WorkerInstruction,
  WorkerRole,
} from '../shared/types';

/** Default platform-tool surface per worker role (D-10). */
export function toolPolicyForRole(role: WorkerRole): WorkerInstruction['platformTools'] {
  switch (role) {
    case 'implementer':
      return 'all'; // write + bash + edit
    case 'planner':
    case 'reviewer':
      return 'readOnly';
    case 'summarizer':
      return 'none';
    case 'custom':
      return 'readOnly';
  }
}

/** The structured result the coordinator parses out of the worker's reply (D-08). */
export interface WorkerOutput {
  /** One-line summary of what the worker did, distilled into next-attempt context. */
  summary: string;
  outcome: 'changes-made' | 'no-change-needed' | 'blocked' | 'no-path-forward';
  /** What a follow-up attempt should try next. */
  nextAction?: string;
  /** Files the worker believes it touched (advisory — the coordinator measures the diff). */
  changedFiles?: string[];
}

const OUTCOMES: ReadonlyArray<WorkerOutput['outcome']> = [
  'changes-made',
  'no-change-needed',
  'blocked',
  'no-path-forward',
];

/**
 * The expected-output shape, embedded in the prompt and recorded on the
 * instruction for replay. It is documentation for the worker and the contract
 * `parseWorkerOutput` enforces — it is never sent to the subagent as a schema.
 */
export const WORKER_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['summary', 'outcome'],
  properties: {
    summary: { type: 'string' },
    outcome: { type: 'string', enum: OUTCOMES },
    nextAction: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
  },
} as const;

const OUTPUT_CONTRACT = [
  'When you are finished, end your reply with a single fenced JSON block and nothing after it:',
  '```json',
  '{',
  '  "summary": "<one line: what you changed and why>",',
  '  "outcome": "changes-made | no-change-needed | blocked | no-path-forward",',
  '  "nextAction": "<optional: what a follow-up attempt should try>",',
  '  "changedFiles": ["<optional: paths you edited>"]',
  '}',
  '```',
].join('\n');

const IMPLEMENTER_SYSTEM_PROMPT = [
  'You are an autonomous implementer working inside a Sero Orchestrator loop.',
  'You are given a goal and must make the minimal, correct changes in the current',
  'workspace to achieve it. Read what you need, then edit files and run commands',
  'with the tools available to you.',
  '',
  'Rules:',
  '- Do not commit, push, or run any git/version-control commands — the',
  '  orchestrator manages version control around you.',
  '- Do not create, modify, run, pause, or stop orchestrator goals/loops.',
  '- Make focused changes; avoid touching unrelated files.',
  '',
  OUTPUT_CONTRACT,
].join('\n');

const SUMMARY_TAIL_BYTES = 600;

export interface ImplementerContext {
  loop: LoopGoal;
  /** The most recent finished attempt, if any — its failure becomes context. */
  priorAttempt?: LoopAttempt;
}

/** Build the implementer worker that performs an attempt's change (D-08). */
export function buildImplementerInstruction(ctx: ImplementerContext): WorkerInstruction {
  return {
    role: 'implementer',
    systemPrompt: IMPLEMENTER_SYSTEM_PROMPT,
    taskPrompt: buildImplementerTask(ctx),
    outputSchema: WORKER_OUTPUT_SCHEMA,
    platformTools: toolPolicyForRole('implementer'),
  };
}

function buildImplementerTask(ctx: ImplementerContext): string {
  const { loop, priorAttempt } = ctx;
  const sections: string[] = [
    `# Goal: ${loop.title}`,
    loop.goal,
  ];

  const task = activeTask(loop);
  if (task) {
    sections.push(
      ['## Current task', task.title, task.description ?? '']
        .filter(Boolean)
        .join('\n'),
    );
    if (task.acceptance?.length) {
      sections.push(['## Acceptance', ...task.acceptance.map((a) => `- ${a}`)].join('\n'));
    }
  }

  if (priorAttempt) {
    sections.push(priorFailureSection(priorAttempt));
  }

  if (loop.checks.length) {
    sections.push(
      ['## Checks that must pass', ...loop.checks.map(describeCheck)].join('\n'),
    );
  }

  const remaining = Math.max(0, loop.stopRule.maxAttempts - loop.attempts.length);
  sections.push(
    `You have roughly ${remaining} attempt(s) left before the loop stops; make this one count.`,
  );

  return sections.filter(Boolean).join('\n\n');
}

function priorFailureSection(attempt: LoopAttempt): string {
  const lines = [`## Previous attempt ${attempt.attemptNumber} (${attempt.status})`];
  if (attempt.learned) lines.push(attempt.learned);
  const failed = attempt.checkResults.filter((result) => result.status === 'failed');
  if (failed.length) {
    lines.push('Failing checks:');
    for (const result of failed) {
      lines.push(`- ${result.command ?? result.checkId}: ${tail(result.summary, SUMMARY_TAIL_BYTES)}`);
    }
  }
  if (attempt.changedFiles.length) {
    lines.push(`Files touched last time: ${attempt.changedFiles.join(', ')}`);
  }
  if (attempt.nextAction) lines.push(`Suggested next step: ${attempt.nextAction}`);
  return lines.join('\n');
}

function describeCheck(check: LoopGoal['checks'][number]): string {
  const required = check.required ? 'required' : 'optional';
  if (check.type === 'review') return `- review by ${check.reviewer} (${required})`;
  return `- \`${check.command}\` (${required})`;
}

/**
 * The most recent finished (non-running) attempt — its failure becomes the next
 * attempt's context. Shared by the background-worker and active-session adapters.
 */
export function priorFinishedAttempt(
  loop: LoopGoal,
  current: LoopAttempt,
): LoopAttempt | undefined {
  for (let index = loop.attempts.length - 1; index >= 0; index--) {
    const attempt = loop.attempts[index]!;
    if (attempt.id !== current.id && attempt.status !== 'running') return attempt;
  }
  return undefined;
}

/** The task the loop is currently working — first active, else first todo. */
export function activeTask(loop: LoopGoal): LoopTask | undefined {
  return (
    loop.tasks.find((task) => task.status === 'active') ??
    loop.tasks.find((task) => task.status === 'todo')
  );
}

/** Extract and parse the worker's trailing fenced JSON block (D-08). Null on miss. */
export function parseWorkerOutput(response: string): WorkerOutput | null {
  const raw = lastFencedJsonBlock(response);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const summary = typeof parsed.summary === 'string' ? parsed.summary : undefined;
  const outcome = OUTCOMES.find((value) => value === parsed.outcome);
  if (!summary || !outcome) return null;
  return {
    summary,
    outcome,
    nextAction: typeof parsed.nextAction === 'string' ? parsed.nextAction : undefined,
    changedFiles: Array.isArray(parsed.changedFiles)
      ? parsed.changedFiles.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

/** The last ```json fenced block (or last bare ``` block) in the text. Shared by reviewers.ts. */
export function lastFencedJsonBlock(text: string): string | null {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = fence.exec(text)) !== null) {
    last = match[1]!.trim();
  }
  return last;
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - max)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
