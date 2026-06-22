/**
 * LLM-backed outcome evaluation and recovery decisions (D-03, D-04, D-13).
 *
 * Failure recovery is model-decided: when a step fails, blocks, or needs
 * revision, the LLM chooses retry / revise-step / revise-plan / skip / wait /
 * block. When execution produces no structured StepOutcome, the LLM evaluates
 * the raw output into one. All calls go through host.runStructured (pure model,
 * no platform tools) and responses are parsed and validated here.
 */

import type {
  Loop,
  LoopPlan,
  LoopStepDefinition,
  RecoveryDecision,
  RecoveryDecisionKind,
  StepAttempt,
  StepOutcome,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import type { OutcomeEvaluator, RecoveryDecider } from './engine-types';
import { extractJson } from './schema';
import { parseStepOutcome } from './executors/prompt';

async function attemptOutput(host: OrchestratorHost, attempt: StepAttempt): Promise<string> {
  if (attempt.outputPath) {
    const content = await host.readArtifact(attempt.outputPath);
    if (content) return content;
  }
  return attempt.observations.map((o) => o.summary).join('\n') || attempt.error || '(no output)';
}

// ── Outcome evaluation ──────────────────────────────────────

const EVALUATE_SYSTEM = `You judge the raw output of one Orchestrator step and report a StepOutcome.

Respond with ONLY one JSON object, in a \`\`\`json fence, nothing else, using these EXACT field names and status values:

\`\`\`json
{
  "status": "succeeded",
  "summary": "one sentence on what happened"
}
\`\`\`

"status" MUST be exactly one of: succeeded, failed, blocked, skipped, needs-revision (use the field name "status", not "result" or "outcome"). Add "variables" only if the step produced values later steps need. Add "completion": { "status": "complete"|"blocked", "reason": string } ONLY if this step's job was to decide the whole loop is done.`;

export const llmEvaluator: OutcomeEvaluator = {
  async evaluate({ host, loop, step, attempt }) {
    const output = await attemptOutput(host, attempt);
    const result = await host.runStructured({
      task: `Step: ${step.title}\nInstructions: ${step.instructions}\nExpected: ${step.expectedOutcome ?? '(none)'}\n\nRaw output:\n${output}\n\nReturn the StepOutcome JSON.`,
      systemPrompt: EVALUATE_SYSTEM,
      parentSessionId: loop.runtime.parentSessionId,
      platformTools: 'none',
    });
    const parsed = result.error ? undefined : parseStepOutcome(result.response);
    return parsed ?? { status: 'failed', summary: result.error ?? 'could not evaluate step output' };
  },
};

// ── Recovery decisions ──────────────────────────────────────

const RECOVERY_SYSTEM = `You decide how an Orchestrator loop recovers from a failed/blocked/needs-revision step.

Respond with ONLY one JSON object, in a \`\`\`json fence, nothing else, using these EXACT field names and values:

\`\`\`json
{
  "decision": "retry-step",
  "reason": "why you chose this",
  "revisedStep": {},
  "revisedPlan": {}
}
\`\`\`

Rules:
- The field MUST be named "decision" (not "action").
- "decision" MUST be the full form, exactly one of: retry-step, revise-step, revise-plan, skip-step, wait, block-loop. Do not abbreviate (use "retry-step", never "retry").
- Include "revisedStep" (a full step definition) ONLY for revise-step. Include "revisedPlan" (a full LoopPlan) ONLY for revise-plan — that is how you add/remove/reorder steps. Omit both otherwise.
- Prefer retry-step or revise-step for a recoverable step; choose block-loop only when no recovery is possible.`;

function remainingLimits(loop: Loop): string {
  return JSON.stringify(loop.limits);
}

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
    `\nRemaining management limits: ${remainingLimits(loop)}`,
    `\nReturn the RecoveryDecision JSON.`,
  ].join('\n');
}

// Minimal defensive synonym map: the prompt asks for the exact full form, this
// just absorbs the most common shorthand a model still slips in.
const DECISION_SYNONYMS: Record<string, RecoveryDecisionKind> = {
  'retry-step': 'retry-step', retry: 'retry-step', retry_step: 'retry-step',
  'revise-step': 'revise-step', revise_step: 'revise-step', revise: 'revise-step',
  'revise-plan': 'revise-plan', revise_plan: 'revise-plan', replan: 'revise-plan',
  'skip-step': 'skip-step', skip: 'skip-step',
  wait: 'wait',
  'block-loop': 'block-loop', block: 'block-loop', blocked: 'block-loop',
};

function normalizeDecision(record: Record<string, unknown>): RecoveryDecisionKind | undefined {
  const raw = record.decision ?? record.action;
  if (typeof raw !== 'string') return undefined;
  const mapped = DECISION_SYNONYMS[raw.trim().toLowerCase()];
  // A bare "revise" disambiguates by which revised payload is present.
  if (mapped === 'revise-step' && !record.revisedStep && record.revisedPlan) return 'revise-plan';
  return mapped;
}

function parseDecision(text: string): { decision: RecoveryDecisionKind; reason: string; revisedStep?: LoopStepDefinition; revisedPlan?: LoopPlan } | undefined {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const decision = normalizeDecision(record);
  if (!decision) return undefined;
  return {
    decision,
    reason: typeof record.reason === 'string' ? record.reason : '',
    revisedStep: (record.revisedStep as LoopStepDefinition) ?? undefined,
    revisedPlan: (record.revisedPlan as LoopPlan) ?? undefined,
  };
}

export const llmDecider: RecoveryDecider = {
  async decide({ host, loop, step, attempt, outcome }): Promise<RecoveryDecision> {
    const task = await buildRecoveryTask(host, loop, step, attempt, outcome);
    const result = await host.runStructured({
      task,
      systemPrompt: RECOVERY_SYSTEM,
      parentSessionId: loop.runtime.parentSessionId,
      platformTools: 'none',
    });
    const modelResponsePath = result.response
      ? await host.writeArtifact(`recovery/${attempt.id}.txt`, result.response)
      : undefined;
    const parsed = result.error ? undefined : parseDecision(result.response);

    const base = {
      id: host.newId('recovery'),
      stepId: step.id,
      failedAttemptId: attempt.id,
      createdAt: host.now(),
      modelResponsePath,
    };
    if (!parsed) {
      return { ...base, decision: 'block-loop', reason: result.error ?? 'could not parse a recovery decision' };
    }
    return { ...base, decision: parsed.decision, reason: parsed.reason, revisedStep: parsed.revisedStep, revisedPlan: parsed.revisedPlan };
  },
};

// ── Manual plan revision (the `revise` action) ──────────────

const REVISE_SYSTEM = `You revise an Orchestrator loop's plan based on the user's request.
Return ONLY a JSON object that is a full LoopPlan: { "schemaVersion": 1, "revision": <number>, "objective": string, "steps": [...], "globalInstructions"?: string }.
Keep step ids stable where steps are unchanged. The dependency graph must be acyclic.`;

export interface RevisionProposal {
  plan?: LoopPlan;
  modelResponsePath?: string;
  error?: string;
}

export async function proposeRevisedPlan(host: OrchestratorHost, loop: Loop, prompt?: string): Promise<RevisionProposal> {
  const task = [
    `Original user prompt:\n${loop.prompt}`,
    `\nCurrent plan:\n${JSON.stringify(loop.plan, null, 2)}`,
    prompt ? `\nRevision request:\n${prompt}` : '\nRevision request: improve the plan so the loop can make progress and eventually emit a completion signal.',
    `\nReturn the revised LoopPlan JSON.`,
  ].join('\n');
  const result = await host.runStructured({ task, systemPrompt: REVISE_SYSTEM, parentSessionId: loop.runtime.parentSessionId, platformTools: 'none' });
  const modelResponsePath = result.response ? await host.writeArtifact(`revision/${host.newId('rev')}.txt`, result.response) : undefined;
  if (result.error) return { error: result.error, modelResponsePath };
  const parsed = extractJson(result.response);
  if (!parsed || typeof parsed !== 'object') return { error: 'revision response was not valid JSON', modelResponsePath };
  return { plan: parsed as LoopPlan, modelResponsePath };
}
