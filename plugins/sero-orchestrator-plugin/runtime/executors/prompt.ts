/**
 * Shared prompt assembly and StepOutcome parsing for step executors.
 *
 * Every step is asked to end its response with a StepOutcome JSON envelope so
 * the coordinator can record a logical result. When the envelope is missing,
 * the engine falls back to an LLM evaluator (Phase 5) or a mechanical status.
 */

import type { Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';
import { extractJson } from '../schema';

const OUTCOME_STATUSES = new Set(['succeeded', 'failed', 'blocked', 'skipped', 'needs-revision']);

export const STEP_SYSTEM_PROMPT = `You are executing one step of a Sero Orchestrator loop.

Do the work described, then END your response with a single JSON object describing the outcome (fenced as \`\`\`json):

{
  "status": "succeeded" | "failed" | "blocked" | "skipped" | "needs-revision",
  "summary": string,                       // one-line result
  "variables": { ... }?,                   // values to merge into loop variables for later steps
  "completion": { "status": "complete" | "blocked", "reason": string }?  // ONLY from a validation/finalization step
}

Only include "completion" when this step's job is to decide whether the whole loop is done. Do not claim completion otherwise.`;

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
  parts.push('\nWhen finished, end with the StepOutcome JSON described in the system prompt.');
  return parts.filter(Boolean).join('\n');
}

/** Parses a StepOutcome envelope from raw response text, if present and valid. */
export function parseStepOutcome(text: string): StepOutcome | undefined {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (typeof record.status !== 'string' || !OUTCOME_STATUSES.has(record.status)) return undefined;
  const outcome: StepOutcome = {
    status: record.status as StepOutcome['status'],
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
