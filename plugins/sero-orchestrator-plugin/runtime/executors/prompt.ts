/**
 * Shared prompt assembly and StepOutcome parsing for step executors.
 *
 * Every step is asked to end its response with a StepOutcome JSON envelope so
 * the coordinator can record a logical result. When the envelope is missing,
 * the engine falls back to an LLM evaluator (Phase 5) or a mechanical status.
 */

import type { Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';
import { extractJson } from '../schema';

// Minimal defensive synonym map: the prompt asks for the exact value, this just
// absorbs the most common shorthand a model still slips in.
const STATUS_SYNONYMS: Record<string, StepOutcome['status']> = {
  succeeded: 'succeeded', success: 'succeeded', successful: 'succeeded', passed: 'succeeded', pass: 'succeeded', ok: 'succeeded', done: 'succeeded',
  failed: 'failed', fail: 'failed', failure: 'failed', error: 'failed',
  blocked: 'blocked', block: 'blocked',
  skipped: 'skipped', skip: 'skipped',
  'needs-revision': 'needs-revision', needs_revision: 'needs-revision', 'needs revision': 'needs-revision', revise: 'needs-revision', revision: 'needs-revision',
};

function normalizeStatus(raw: unknown): StepOutcome['status'] | undefined {
  return typeof raw === 'string' ? STATUS_SYNONYMS[raw.trim().toLowerCase()] : undefined;
}

export const STEP_SYSTEM_PROMPT = `You are executing ONE step of a Sero Orchestrator loop. Do the work the step describes using your normal tools.

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
- "variables" is optional — values later steps will need.
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
  parts.push('\nWhen finished, end your reply with the StepOutcome JSON block (exact fields: "status", "summary") in a ```json fence, and nothing after it.');
  return parts.filter(Boolean).join('\n');
}

/** Parses a StepOutcome envelope from raw response text, if present and valid. */
export function parseStepOutcome(text: string): StepOutcome | undefined {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const status = normalizeStatus(record.status ?? record.outcome ?? record.result);
  if (!status) return undefined;
  const outcome: StepOutcome = {
    status,
    summary: typeof record.summary === 'string' ? record.summary : '',
  };
  if (record.variables && typeof record.variables === 'object' && !Array.isArray(record.variables)) {
    outcome.variables = record.variables as Record<string, unknown>;
  }
  if (record.completion && typeof record.completion === 'object' && !Array.isArray(record.completion)) {
    const completion = record.completion as Record<string, unknown>;
    if ((completion.status === 'complete' || completion.status === 'blocked') && typeof completion.reason === 'string') {
      outcome.completion = { status: completion.status, reason: completion.reason };
    }
  }
  return outcome;
}
