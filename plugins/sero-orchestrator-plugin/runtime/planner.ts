/**
 * Planner — converts a user prompt into a validated PlanningResponse using the
 * standard Sero model execution path (host.runStructured). On validation
 * failure it performs exactly one repair pass before giving up (D-01, D-09).
 *
 * The planner may also reply with `clarifyingQuestions` instead of a plan when
 * the request is missing essential information; that surfaces as a `needsInput`
 * outcome (see specs/07-human-input.md) and skips the repair pass.
 */

import type { ContextToolInfo } from '@sero-ai/common';
import type { HumanQuestion, PlanningResponse } from '../shared/types';
import type { OrchestratorHost } from './host';
import { PLANNING_SYSTEM_PROMPT, buildPlanningTask, buildRepairTask } from './planner-prompt';
import { extractJson, validatePlanningResponse } from './schema';
import { isRecord } from './structured-call';
import { parseHumanQuestions } from './human-input';

export interface PlanRequest {
  prompt: string;
  parentSessionId: string;
  /** The loop's workspace isolation, so the planner adds the right delivery step. */
  useManagedWorktree: boolean;
  /** The real tool catalog the planner picks each step's tools from. */
  toolCatalog?: ContextToolInfo[];
  /** Answered clarifying questions folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
}

export type PlanOutcome =
  | { ok: true; response: PlanningResponse; modelResponses: string[] }
  | { ok: false; needsInput: true; questions: HumanQuestion[]; modelResponses: string[] }
  | { ok: false; needsInput?: false; errors: string[]; modelResponses: string[] };

type Classified =
  | { kind: 'plan'; response: PlanningResponse }
  | { kind: 'questions'; questions: HumanQuestion[] }
  | { kind: 'error'; errors: string[] };

/** Classifies a raw planner reply: clarifying questions, a valid plan, or errors. */
function classify(text: string): Classified {
  const parsed = extractJson(text);
  if (parsed === undefined) return { kind: 'error', errors: ['model response was not valid JSON'] };
  if (isRecord(parsed)) {
    const questions = parseHumanQuestions(parsed.clarifyingQuestions);
    if (questions) return { kind: 'questions', questions };
  }
  const validated = validatePlanningResponse(parsed);
  return validated.ok ? { kind: 'plan', response: validated.value } : { kind: 'error', errors: validated.errors };
}

async function runPlanning(host: OrchestratorHost, req: PlanRequest, task: string): Promise<string> {
  const result = await host.runStructured({
    task,
    systemPrompt: PLANNING_SYSTEM_PROMPT,
    model: req.model,
    thinking: req.thinking,
    parentSessionId: req.parentSessionId,
    platformTools: 'none',
    signal: req.signal,
  });
  if (result.error) throw new Error(result.error);
  return result.response;
}

export async function planLoop(host: OrchestratorHost, req: PlanRequest): Promise<PlanOutcome> {
  const modelResponses: string[] = [];

  let first: string;
  try {
    first = await runPlanning(host, req, buildPlanningTask(req.prompt, req.useManagedWorktree, req.toolCatalog, req.clarifications));
  } catch (error) {
    return { ok: false, errors: [`planning model call failed: ${asMessage(error)}`], modelResponses };
  }
  modelResponses.push(first);

  const firstResult = classify(first);
  if (firstResult.kind === 'plan') return { ok: true, response: firstResult.response, modelResponses };
  if (firstResult.kind === 'questions') return { ok: false, needsInput: true, questions: firstResult.questions, modelResponses };

  // One repair pass for a structurally-invalid plan.
  host.log(`plan validation failed, attempting repair: ${firstResult.errors.join('; ')}`);
  let repaired: string;
  try {
    repaired = await runPlanning(host, req, buildRepairTask(req.prompt, first, firstResult.errors));
  } catch (error) {
    return { ok: false, errors: [`plan repair call failed: ${asMessage(error)}`, ...firstResult.errors], modelResponses };
  }
  modelResponses.push(repaired);

  const repairedResult = classify(repaired);
  if (repairedResult.kind === 'plan') return { ok: true, response: repairedResult.response, modelResponses };
  if (repairedResult.kind === 'questions') return { ok: false, needsInput: true, questions: repairedResult.questions, modelResponses };
  return { ok: false, errors: repairedResult.errors, modelResponses };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
