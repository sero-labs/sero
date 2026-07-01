/**
 * Shared prompt assembly and StepOutcome parsing for step executors.
 *
 * Every step is asked to end its response with a StepOutcome JSON envelope so
 * the coordinator can record a logical result. When the envelope is missing,
 * the engine falls back to an LLM evaluator (Phase 5) or a mechanical status.
 */

import type { Loop, LoopRun, LoopStepDefinition, StepCompletion, StepOutcome } from '../../shared/types';
import { extractJson } from '../schema';
import { describeValue, isRecord, type ParseResult } from '../structured-call';
import { parseHumanQuestions } from '../human-input';
import { formatRouteContract, routeVariableRequirements } from '../route-contract';
import { finalizationStepId } from '../readiness';

const STEP_STATUSES: readonly StepOutcome['status'][] = ['succeeded', 'failed', 'blocked', 'skipped', 'needs-revision'];

export const STEP_SYSTEM_PROMPT = `You are executing ONE step of a Sero Orchestrator loop. Do the work the step describes using your normal tools.

USE THE CONTEXT YOU ARE GIVEN. Your task includes the loop's current variables and the results of completed dependency steps. Build on them — do not re-discover what an earlier step already found (file locations, symbol names, decisions). When you learn something a later step will need, RECORD it in your StepOutcome "variables": put concrete values under clear keys (e.g. "targetFile"), and put brief free-form findings under a "notes" string. "notes" accumulates across steps as a shared scratchpad, so add a short line, don't repeat what's already there.

THE WORKING DIRECTORY IS SHARED AND CUMULATIVE. Every step of this loop runs in the SAME git worktree, one after another. Files that an earlier step created or edited — INCLUDING new files that are still untracked (not yet \`git add\`ed or committed) — are this loop's in-progress work product, NOT stray cruft. Never delete, revert, \`git checkout --\`/\`git restore\`, \`git stash\`, or \`git clean\` another step's changes unless your own step explicitly tells you to undo work. When your step inspects or reviews the changes, account for untracked files too (e.g. \`git status\`, or \`git add -A\` then \`git diff --staged\`): a new untracked file is intended work from a prior step, not an accident. If the changes look wrong, report it via your StepOutcome ("needs-revision" or "blocked") instead of erasing them.

CRITICAL — how to report the result: after doing the work, your reply MUST END with exactly one JSON object, wrapped in a \`\`\`json code fence, and nothing after it. Use these EXACT field names and these EXACT status values:

\`\`\`json
{
  "status": "succeeded",
  "summary": "one sentence describing the result",
  "variables": {},
  "completion": { "status": "complete", "reason": "why the loop is done" }
}
\`\`\`

Rules for that JSON:
- "status" MUST be exactly one of: succeeded, failed, blocked, skipped, needs-revision. These are the ONLY allowed values. For a step that did its job, the value is exactly "succeeded" — NOT "completed", "complete", "done", "ok", or "success". Any other word is rejected and forces a costly re-evaluation, so use "succeeded".
- Use the field name "status" (not "result", "outcome", or "action").
- Choosing the status: use "skipped" when the step's precondition is not met or it is simply not applicable (e.g. an "if available" step whose condition is false) — that is a normal, non-failing outcome, NOT "blocked". Use "blocked" only when the step SHOULD run but cannot make progress and needs a human. Use "failed" when the work was attempted but did not succeed.
- "variables" is optional — record the values/notes later steps will need (see "USE THE CONTEXT" above); "notes" accumulates as a shared scratchpad.
- Include "completion" ONLY if THIS step's job is to decide the whole loop is done; its "status" is "complete" or "blocked". Omit it otherwise.
- Put nothing after the closing fence.

ASKING THE USER. If you genuinely cannot finish this step without a decision or information only the user can give — an irreversible/destructive choice, an ambiguous requirement, a missing value, or an explicit "confirm before doing X" — you may ask instead of guessing. Add a "questions" array to your StepOutcome and set "status" to "needs-revision":

\`\`\`json
{
  "status": "needs-revision",
  "summary": "waiting on the user to confirm whether to drop the legacy table",
  "questions": [
    { "prompt": "The migration drops invoices_old (12,400 rows). Drop it, or keep it and only add the new tables?", "choices": ["Drop it", "Keep it, add new tables only"] }
  ]
}
\`\`\`

The loop PAUSES until the user answers; this step then runs again with their answer added to the notes. Use this sparingly — only when proceeding without the answer would be wrong or unsafe. Each question needs a "prompt"; "choices" (a string array of quick options) is optional, and the user can always type a free-text answer. Record any work you already did in "variables"/"notes" before asking, since the step restarts from the top on resume. Do NOT ask for things you can find or decide yourself. Always ask THROUGH this "questions" array — never through a separate question/ask/confirm tool, which does not pause the loop and is not recorded; and never assume or invent the user's answer.`;

/** Observations relevant to a step: the summaries of its dependencies' outcomes. */
function dependencyContext(loop: Loop, step: LoopStepDefinition): string {
  const lines: string[] = [];
  for (const dep of step.dependsOn ?? []) {
    const outcome = loop.runtime.stepStates[dep]?.outcome;
    if (outcome) lines.push(`- ${dep}: ${outcome.status} — ${outcome.summary}`);
  }
  return lines.length ? `\nResults of completed dependencies:\n${lines.join('\n')}` : '';
}

function variablesContext(loop: Loop): string {
  const keys = Object.keys(loop.runtime.variables);
  return keys.length ? `\nCurrent loop variables:\n${JSON.stringify(loop.runtime.variables, null, 2)}` : '';
}

/**
 * Inventory of the loop's own open PRs (branch matches the loop id, refreshed at
 * run start). Injected for background-agent steps only — they touch the repo — so
 * a recurring loop doesn't redo work an open PR already covers. The model judges
 * coverage; we only feed it the list.
 */
function openPullRequestsContext(loop: Loop, step: LoopStepDefinition): string {
  if (step.execution.type !== 'background-agent') return '';
  const prs = loop.runtime.pullRequests ?? [];
  if (prs.length === 0) return '';
  const lines = prs.map((pr) => `- #${pr.number} "${pr.title}" (branch ${pr.headRefName})`);
  return `\nOpen pull requests already raised by this loop (do not duplicate work an open PR already covers — judge coverage yourself):\n${lines.join('\n')}`;
}

/**
 * The event that started this run (Living Loops): what fired and its payload,
 * so the steps act on the concrete occurrence — the failing PR, the changed
 * files — instead of re-discovering it.
 */
function eventContext(run?: LoopRun): string {
  if (!run?.firedBy) return '';
  const observation = run.observations.find((o) => o.source === 'event');
  const payload = observation?.data ? `\nEvent payload:\n${JSON.stringify(observation.data, null, 2)}` : '';
  return `\nThis iteration was fired by an event — ${run.firedBy.source} at ${run.firedBy.occurredAt}: ${run.firedBy.summary}.${payload}`;
}

export function buildStepTask(loop: Loop, step: LoopStepDefinition, run?: LoopRun): string {
  const parts = [`Loop objective: ${loop.plan.objective}`];
  if (loop.plan.globalInstructions) parts.push(`Global instructions: ${loop.plan.globalInstructions}`);
  parts.push(eventContext(run));
  parts.push(`\nStep: ${step.title}\n${step.instructions}`);
  if (step.expectedOutcome) parts.push(`\nExpected outcome: ${step.expectedOutcome}`);
  parts.push(dependencyContext(loop, step));
  parts.push(variablesContext(loop));
  parts.push(openPullRequestsContext(loop, step));
  parts.push(formatRouteContract(routeVariableRequirements(loop, step)));
  if (step.execution.type === 'model' && step.execution.outputSchema !== undefined) {
    parts.push(`\nReturn output matching this schema (include it in the StepOutcome variables):\n${JSON.stringify(step.execution.outputSchema, null, 2)}`);
  }
  const finalId = finalizationStepId(loop);
  if (finalId === step.id) {
    parts.push('\nThis is the loop\'s FINAL step — nothing runs after it, so the loop only ends if you end it here. After doing the work, judge whether the loop\'s overall objective is now fully met, then include a "completion" object in your StepOutcome: { "status": "complete", "reason": ... } if it is met, or { "status": "blocked", "reason": ... } if it cannot be. Without a completion signal the loop never finishes.');
  } else if (finalId !== undefined) {
    parts.push('\nThis is NOT the loop\'s final step — do NOT include a "completion" object; a later finalization step decides when the whole loop is done. (If you genuinely cannot proceed, report it with your "status", not a completion.)');
  }
  parts.push('\nWhen finished, end your reply with the StepOutcome JSON block (exact fields: "status", "summary") in a ```json fence, and nothing after it.');
  return parts.filter(Boolean).join('\n');
}

/**
 * Strictly validates a StepOutcome. No value coercion: an unexpected `status`,
 * a missing `summary`, or a malformed `completion`/`variables` is rejected with
 * a precise reason the caller feeds back to the model for repair.
 */
export function parseStepOutcomeStrict(value: unknown): ParseResult<StepOutcome> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Reply must contain exactly one JSON object with the StepOutcome fields.'] };
  }
  const errors: string[] = [];
  const status = value.status;
  if (typeof status !== 'string' || !(STEP_STATUSES as readonly string[]).includes(status)) {
    errors.push(`"status" must be exactly one of: ${STEP_STATUSES.join(', ')} — got ${describeValue(value.status)}. Use the field name "status".`);
  }
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    errors.push(`"summary" must be a non-empty string — got ${describeValue(value.summary)}.`);
  }
  if (value.variables !== undefined && !isRecord(value.variables)) {
    errors.push(`"variables", if present, must be a JSON object — got ${describeValue(value.variables)}.`);
  }
  const completion = parseCompletion(value.completion, errors);
  if (errors.length > 0) return { ok: false, errors };

  const outcome: StepOutcome = { status: status as StepOutcome['status'], summary: value.summary as string };
  if (isRecord(value.variables)) outcome.variables = value.variables as Record<string, unknown>;
  if (completion) outcome.completion = completion;
  // Lenient: a malformed `questions` is simply dropped (the step proceeds) rather
  // than failing the whole envelope — the model decides whether to ask at all.
  const questions = parseHumanQuestions(value.questions);
  if (questions) outcome.questions = questions;
  return { ok: true, value: outcome };
}

function parseCompletion(raw: unknown, errors: string[]): StepCompletion | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || (raw.status !== 'complete' && raw.status !== 'blocked') || typeof raw.reason !== 'string' || !raw.reason.trim()) {
    errors.push('"completion", if present, must be { "status": "complete" | "blocked", "reason": <non-empty string> } (add "final": true to stop a scheduled loop for good).');
    return undefined;
  }
  const completion: StepCompletion = { status: raw.status, reason: raw.reason };
  if (raw.final === true) completion.final = true;
  return completion;
}

/** Fast-path parse of a step's own envelope; undefined when absent or invalid. */
export function parseStepOutcome(text: string): StepOutcome | undefined {
  const parsed = parseStepOutcomeStrict(extractJson(text));
  return parsed.ok ? parsed.value : undefined;
}

/**
 * In-session repair message for a missing/invalid StepOutcome envelope. Sent as
 * a follow-up turn in the SAME subagent session (no new subagent), so the agent
 * keeps all its context and only needs to re-emit the JSON correctly.
 */
export function buildOutcomeRepair(errors: string[]): string {
  return [
    'Your reply did not end with a valid StepOutcome JSON block.',
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nDo NOT redo the work or run more tools. Reply with ONLY the corrected StepOutcome JSON in a ```json fence and nothing after it, using these EXACT field names and one of these EXACT status values: succeeded, failed, blocked, skipped, needs-revision.',
  ].join('\n');
}
