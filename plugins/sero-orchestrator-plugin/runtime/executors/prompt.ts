/**
 * Shared prompt assembly and StepOutcome parsing for step executors.
 *
 * Every step is asked to end its response with a StepOutcome JSON envelope so
 * the coordinator can record a logical result. When the envelope is missing,
 * the engine falls back to an LLM evaluator (Phase 5) or a mechanical status.
 */

import type { Loop, LoopStepDefinition, StepCompletion, StepOutcome } from '../../shared/types';
import { extractJson } from '../schema';
import { describeValue, isRecord, type ParseResult } from '../structured-call';

const STEP_STATUSES: readonly StepOutcome['status'][] = ['succeeded', 'failed', 'blocked', 'skipped', 'needs-revision'];

export const STEP_SYSTEM_PROMPT = `You are executing ONE step of a Sero Orchestrator loop. Do the work the step describes using your normal tools.

USE THE CONTEXT YOU ARE GIVEN. Your task includes the loop's current variables and the results of completed dependency steps. Build on them — do not re-discover what an earlier step already found (file locations, symbol names, decisions). When you learn something a later step will need, RECORD it in your StepOutcome "variables": put concrete values under clear keys (e.g. "targetFile"), and put brief free-form findings under a "notes" string. "notes" accumulates across steps as a shared scratchpad, so add a short line, don't repeat what's already there.

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
- "status" MUST be exactly one of: succeeded, failed, blocked, skipped, needs-revision. Do not invent other values.
- Use the field name "status" (not "result", "outcome", or "action").
- Choosing the status: use "skipped" when the step's precondition is not met or it is simply not applicable (e.g. an "if available" step whose condition is false) — that is a normal, non-failing outcome, NOT "blocked". Use "blocked" only when the step SHOULD run but cannot make progress and needs a human. Use "failed" when the work was attempted but did not succeed.
- "variables" is optional — record the values/notes later steps will need (see "USE THE CONTEXT" above); "notes" accumulates as a shared scratchpad.
- Include "completion" ONLY if THIS step's job is to decide the whole loop is done; its "status" is "complete" or "blocked". Omit it otherwise.
- Put nothing after the closing fence.`;

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
 * The loop's finalization step is its single dependency-graph sink — the one
 * step nothing else depends on. Only a planned step outcome emits completion
 * (D-03), so that sink must decide it or the loop never ends. When the graph has
 * several leaves we can't single one out, so we leave it to the step's authored
 * instructions and don't force a completion signal anywhere.
 */
function finalizationStepId(loop: Loop): string | undefined {
  const sinks = loop.plan.steps.filter(
    (step) => !loop.plan.steps.some((s) => (s.dependsOn ?? []).includes(step.id)),
  );
  return sinks.length === 1 ? sinks[0].id : undefined;
}

export function buildStepTask(loop: Loop, step: LoopStepDefinition): string {
  const parts = [`Loop objective: ${loop.plan.objective}`];
  if (loop.plan.globalInstructions) parts.push(`Global instructions: ${loop.plan.globalInstructions}`);
  parts.push(`\nStep: ${step.title}\n${step.instructions}`);
  if (step.expectedOutcome) parts.push(`\nExpected outcome: ${step.expectedOutcome}`);
  parts.push(dependencyContext(loop, step));
  parts.push(variablesContext(loop));
  if (step.execution.type === 'model' && step.execution.outputSchema !== undefined) {
    parts.push(`\nReturn output matching this schema (include it in the StepOutcome variables):\n${JSON.stringify(step.execution.outputSchema, null, 2)}`);
  }
  if (finalizationStepId(loop) === step.id) {
    parts.push('\nThis is the loop\'s FINAL step — nothing runs after it, so the loop only ends if you end it here. After doing the work, judge whether the loop\'s overall objective is now fully met, then include a "completion" object in your StepOutcome: { "status": "complete", "reason": ... } if it is met, or { "status": "blocked", "reason": ... } if it cannot be. Without a completion signal the loop never finishes.');
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
