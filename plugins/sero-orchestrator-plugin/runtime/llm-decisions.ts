/**
 * LLM-backed outcome evaluation and recovery decisions (D-03, D-04, D-13).
 *
 * Failure recovery is model-decided: when a step fails, blocks, or needs
 * revision, the LLM chooses retry / revise-step / revise-plan / skip / accept /
 * wait / block. When execution produces no structured StepOutcome, the LLM
 * evaluates the raw output into one.
 *
 * Every call goes through host.runStructured (pure model, no platform tools).
 * Responses are validated STRICTLY here — no value-guessing — and any mismatch
 * is sent back to the model with the exact reason for a bounded repair pass
 * (structured-call.ts). We never coerce an unexpected value; we reject it.
 */

import type {
  Loop,
  LoopLimits,
  LoopPlan,
  LoopStepDefinition,
  RecoveryDecision,
  RecoveryDecisionKind,
  StepAttempt,
  StepOutcome,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import type { OutcomeEvaluator, RecoveryDecider } from './engine-types';
import { validateLoopPlan } from './schema';
import { loopArtifactDir } from './artifacts';
import { parseStepOutcomeStrict } from './executors/prompt';
import { describeValue, isRecord, runStructuredJson, type ParseResult } from './structured-call';

async function attemptOutput(host: OrchestratorHost, attempt: StepAttempt): Promise<string> {
  if (attempt.outputPath) {
    const content = await host.readArtifact(attempt.outputPath);
    if (content) return content;
  }
  return attempt.observations.map((o) => o.summary).join('\n') || attempt.error || '(no output)';
}

/** Joins the raw replies (initial + any repair passes) for a debuggable artifact. */
function joinResponses(responses: string[]): string {
  return responses.join('\n\n--- repair ---\n\n');
}

// ── Outcome evaluation ──────────────────────────────────────

const EVALUATE_SYSTEM = `You judge the raw output of one Orchestrator step and report a StepOutcome as JSON.

Return ONLY one JSON object, in a \`\`\`json fence and nothing else, with these EXACT field names and values:

\`\`\`json
{
  "status": "succeeded",
  "summary": "one sentence on what happened"
}
\`\`\`

- "status" MUST be exactly one of: succeeded, failed, blocked, skipped, needs-revision. Use the field name "status" (not "result" or "outcome"). The raw output may contain its OWN status word such as "completed" — ignore it and map to the correct allowed value ("succeeded" when the work got done). Never echo a value outside the allowed set.
- Add "variables" (a JSON object) only if the step produced values later steps need.
- Add "completion": { "status": "complete" | "blocked", "reason": <string> } ONLY if this step's job was to decide the whole loop is done.`;

function buildEvaluateTask(step: LoopStepDefinition, output: string): string {
  return `Step: ${step.title}\nInstructions: ${step.instructions}\nExpected: ${step.expectedOutcome ?? '(none)'}\n\nRaw output:\n${output}\n\nReturn the StepOutcome JSON.`;
}

function buildEvaluateRepair(previous: string, errors: string[]): string {
  return [
    'Your previous StepOutcome was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected StepOutcome JSON that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

export const llmEvaluator: OutcomeEvaluator = {
  async evaluate({ host, loop, step, attempt }) {
    const output = await attemptOutput(host, attempt);
    const result = await runStructuredJson<StepOutcome>(host, {
      systemPrompt: EVALUATE_SYSTEM,
      task: buildEvaluateTask(step, output),
      parse: parseStepOutcomeStrict,
      buildRepair: buildEvaluateRepair,
      parentSessionId: loop.runtime.parentSessionId,
    });
    if (result.responses.length > 0) {
      await host.writeArtifact(`${loopArtifactDir(loop.id)}/evaluation/${attempt.id}.txt`, joinResponses(result.responses));
    }
    if (result.ok) return result.value!;
    return { status: 'failed', summary: result.errors[0] ?? 'could not evaluate step output' };
  },
};

// ── Recovery decisions ──────────────────────────────────────

const RECOVERY_DECISIONS: readonly RecoveryDecisionKind[] = [
  'retry-step', 'revise-step', 'revise-plan', 'skip-step', 'accept-step', 'wait', 'block-loop',
];

const RECOVERY_SYSTEM = `You decide how an Orchestrator loop recovers from a failed/blocked/needs-revision step.

Return ONLY one JSON object, in a \`\`\`json fence and nothing else, using these EXACT field names and values:

\`\`\`json
{
  "decision": "retry-step",
  "reason": "why you chose this"
}
\`\`\`

"decision" MUST be exactly one of:
- "retry-step" — run the step again unchanged (transient failure).
- "revise-step" — replace this one step; include "revisedStep" (a full step definition).
- "revise-plan" — add/remove/reorder steps; include "revisedPlan" (a full LoopPlan).
- "skip-step" — give up on this step and continue; its dependents proceed.
- "accept-step" — the step ACTUALLY met its goal and the earlier failure was only a reporting/format problem. Include "acceptedOutcome" (a full StepOutcome with the success it should have reported).
- "wait" — pause this run; there is nothing to do yet.
- "block-loop" — stop the loop for human attention; no recovery is possible.

Rules:
- Use the field name "decision" (not "action"). Use the exact full forms above; never abbreviate (e.g. "retry-step", never "retry").
- Include "revisedStep" ONLY for revise-step, "revisedPlan" ONLY for revise-plan, "acceptedOutcome" ONLY for accept-step. Omit them otherwise.
- Prefer accept-step when the work was done but mis-reported; prefer retry-step or revise-step for a recoverable step; choose block-loop only when nothing else can work.`;

function priorAttempts(loop: Loop, stepId: string): number {
  return loop.runtime.stepStates[stepId]?.attempts ?? 0;
}

function completedOutcomes(loop: Loop): string {
  const lines = Object.entries(loop.runtime.stepStates)
    .filter(([, s]) => s.outcome)
    .map(([id, s]) => `- ${id}: ${s.outcome!.status} — ${s.outcome!.summary}`);
  return lines.join('\n') || '(none)';
}

async function buildRecoveryTask(host: OrchestratorHost, loop: Loop, step: LoopStepDefinition, attempt: StepAttempt, outcome: StepOutcome): Promise<string> {
  const output = await attemptOutput(host, attempt);
  return [
    `Original user prompt:\n${loop.prompt}`,
    `\nCurrent plan:\n${JSON.stringify(loop.plan, null, 2)}`,
    `\nFailed step:\n${JSON.stringify(step, null, 2)}`,
    `\nStep outcome: ${outcome.status} — ${outcome.summary}`,
    `\nFailed attempt output:\n${output}`,
    `\nPrior attempts for this step: ${priorAttempts(loop, step.id)}`,
    `\nCompleted step outcomes:\n${completedOutcomes(loop)}`,
    `\nRemaining management limits: ${JSON.stringify(loop.limits)}`,
    `\nReturn the RecoveryDecision JSON.`,
  ].join('\n');
}

function buildRecoveryRepair(previous: string, errors: string[]): string {
  return [
    'Your previous RecoveryDecision was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected RecoveryDecision JSON that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

interface ParsedDecision {
  decision: RecoveryDecisionKind;
  reason: string;
  revisedStep?: LoopStepDefinition;
  revisedPlan?: LoopPlan;
  acceptedOutcome?: StepOutcome;
}

/**
 * Strictly validates a RecoveryDecision. The decision keyword and the presence
 * of its required payload are checked here; the payload's deep structure
 * (revisedStep/revisedPlan) is validated when applied (recovery-apply.ts).
 */
function parseDecision(value: unknown): ParseResult<ParsedDecision> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Reply must contain exactly one JSON object with a "decision" field.'] };
  }
  const decision = value.decision;
  if (typeof decision !== 'string' || !(RECOVERY_DECISIONS as readonly string[]).includes(decision)) {
    return { ok: false, errors: [`"decision" must be exactly one of: ${RECOVERY_DECISIONS.join(', ')} — got ${describeValue(value.decision)}. Use the field name "decision".`] };
  }
  const kind = decision as RecoveryDecisionKind;
  const errors: string[] = [];
  const parsed: ParsedDecision = { decision: kind, reason: typeof value.reason === 'string' ? value.reason : '' };

  if (kind === 'revise-step') {
    if (!isRecord(value.revisedStep)) errors.push('"revise-step" requires "revisedStep" (a full step definition).');
    else parsed.revisedStep = value.revisedStep as unknown as LoopStepDefinition;
  }
  if (kind === 'revise-plan') {
    if (!isRecord(value.revisedPlan)) errors.push('"revise-plan" requires "revisedPlan" (a full LoopPlan).');
    else parsed.revisedPlan = value.revisedPlan as unknown as LoopPlan;
  }
  if (kind === 'accept-step') {
    const outcome = parseStepOutcomeStrict(value.acceptedOutcome);
    if (!outcome.ok) errors.push(...outcome.errors.map((e) => `"acceptedOutcome": ${e}`));
    else parsed.acceptedOutcome = outcome.value;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: parsed };
}

export const llmDecider: RecoveryDecider = {
  async decide({ host, loop, step, attempt, outcome }): Promise<RecoveryDecision> {
    const result = await runStructuredJson<ParsedDecision>(host, {
      systemPrompt: RECOVERY_SYSTEM,
      task: await buildRecoveryTask(host, loop, step, attempt, outcome),
      parse: parseDecision,
      buildRepair: buildRecoveryRepair,
      parentSessionId: loop.runtime.parentSessionId,
    });
    const modelResponsePath = result.responses.length
      ? await host.writeArtifact(`${loopArtifactDir(loop.id)}/recovery/${attempt.id}.txt`, joinResponses(result.responses))
      : undefined;
    const base = {
      id: host.newId('recovery'),
      stepId: step.id,
      failedAttemptId: attempt.id,
      createdAt: host.now(),
      modelResponsePath,
    };
    if (!result.ok) {
      return { ...base, decision: 'block-loop', reason: result.errors[0] ?? 'could not parse a recovery decision' };
    }
    const d = result.value!;
    return { ...base, decision: d.decision, reason: d.reason, revisedStep: d.revisedStep, revisedPlan: d.revisedPlan, acceptedOutcome: d.acceptedOutcome };
  },
};

// ── Manual plan revision (the `revise` action) ──────────────

const REVISE_SYSTEM = `You revise an Orchestrator loop based on the user's request. A loop has a GOAL, step PLAN, and management LIMITS. A refinement may change any of them.

Return ONLY a single JSON object with these keys (no prose):
{
  "goal": <the loop's full goal as plain English, restated to reflect the request. If the request does not change the goal, return the current goal VERBATIM>,
  "plan": <a full LoopPlan: { "schemaVersion": 1, "revision": <number>, "objective": string, "steps": [...], "globalInstructions"?: string }>,
  "limits"?: <only the changed management limits: { "maxAttemptsPerStep"?: number, "maxAttemptsTotal"?: number, "maxConcurrentSteps"?: number, "maxWallClockMs"?: number, "maxTotalTokens"?: number, "maxCostUsd"?: number }>
}
Omit "limits" when the request does not change them. Keep step ids stable where steps are unchanged. The dependency graph must be acyclic.`;

export interface RevisionProposal {
  /** The loop's goal, restated to reflect the refinement (verbatim if unchanged). */
  goal?: string;
  plan?: LoopPlan;
  limits?: Partial<LoopLimits>;
  modelResponsePath?: string;
  error?: string;
}

interface RevisionResult {
  goal: string;
  plan: LoopPlan;
  limits?: Partial<LoopLimits>;
}

function buildRevisionTask(loop: Loop, prompt?: string): string {
  return [
    `Current goal:\n${loop.prompt}`,
    `\nCurrent plan:\n${JSON.stringify(loop.plan, null, 2)}`,
    `\nCurrent limits:\n${JSON.stringify(loop.limits, null, 2)}`,
    prompt ? `\nRefinement request:\n${prompt}` : '\nRefinement request: improve the plan so the loop can make progress and eventually emit a completion signal.',
    `\nReturn the updated { "goal", "plan", "limits"? } JSON. Return the current goal verbatim when unchanged. Omit "limits" when unchanged.`,
  ].join('\n');
}

function buildRevisionRepair(previous: string, errors: string[]): string {
  return [
    'Your previous revision was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected { "goal", "plan", "limits"? } JSON that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

function parseRevision(value: unknown): ParseResult<RevisionResult> {
  if (!isRecord(value)) return { ok: false, errors: ['Reply must be a single JSON object with "goal" and "plan".'] };
  const errors: string[] = [];
  if (typeof value.goal !== 'string' || !value.goal.trim()) {
    errors.push('"goal" must be a non-empty string (the loop\'s full plain-English goal).');
  }
  if (!isRecord(value.plan)) {
    errors.push('"plan" must be a full LoopPlan object.');
  } else {
    errors.push(...validateLoopPlan(value.plan as unknown as LoopPlan));
  }
  if (value.limits !== undefined && !isRecord(value.limits)) {
    errors.push('"limits" must be an object when provided.');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      goal: (value.goal as string).trim(),
      plan: value.plan as unknown as LoopPlan,
      limits: value.limits as Partial<LoopLimits> | undefined,
    },
  };
}

export async function proposeRevisedPlan(host: OrchestratorHost, loop: Loop, prompt?: string): Promise<RevisionProposal> {
  const result = await runStructuredJson<RevisionResult>(host, {
    systemPrompt: REVISE_SYSTEM,
    task: buildRevisionTask(loop, prompt),
    parse: parseRevision,
    buildRepair: buildRevisionRepair,
    parentSessionId: loop.runtime.parentSessionId,
  });
  const modelResponsePath = result.responses.length
    ? await host.writeArtifact(`${loopArtifactDir(loop.id)}/revision/${host.newId('rev')}.txt`, joinResponses(result.responses))
    : undefined;
  if (result.ok) {
    return {
      goal: result.value!.goal,
      plan: result.value!.plan,
      limits: result.value!.limits,
      modelResponsePath,
    };
  }
  return { error: result.errors[0] ?? 'revision response was invalid', modelResponsePath };
}
