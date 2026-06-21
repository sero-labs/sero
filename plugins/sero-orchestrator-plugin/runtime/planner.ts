/**
 * Planner — converts a user prompt into a validated PlanningResponse using the
 * standard Sero model execution path (host.runStructured). On validation
 * failure it performs exactly one repair pass before giving up (D-01, D-09).
 */

import type { PlanningResponse } from '../shared/types';
import type { OrchestratorHost } from './host';
import { PLANNING_SYSTEM_PROMPT, buildPlanningTask, buildRepairTask } from './planner-prompt';
import { extractJson, validatePlanningResponse } from './schema';

export interface PlanRequest {
  prompt: string;
  parentSessionId: string;
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
}

export type PlanOutcome =
  | { ok: true; response: PlanningResponse; modelResponses: string[] }
  | { ok: false; errors: string[]; modelResponses: string[] };

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

  const attempt = (text: string) => {
    modelResponses.push(text);
    const parsed = extractJson(text);
    if (parsed === undefined) return { ok: false as const, errors: ['model response was not valid JSON'] };
    return validatePlanningResponse(parsed);
  };

  let first: string;
  try {
    first = await runPlanning(host, req, buildPlanningTask(req.prompt));
  } catch (error) {
    return { ok: false, errors: [`planning model call failed: ${asMessage(error)}`], modelResponses };
  }

  const firstResult = attempt(first);
  if (firstResult.ok) return { ok: true, response: firstResult.value, modelResponses };

  // One repair pass.
  host.log(`plan validation failed, attempting repair: ${firstResult.errors.join('; ')}`);
  let repaired: string;
  try {
    repaired = await runPlanning(host, req, buildRepairTask(req.prompt, first, firstResult.errors));
  } catch (error) {
    return { ok: false, errors: [`plan repair call failed: ${asMessage(error)}`, ...firstResult.errors], modelResponses };
  }

  const repairedResult = attempt(repaired);
  if (repairedResult.ok) return { ok: true, response: repairedResult.value, modelResponses };
  return { ok: false, errors: repairedResult.errors, modelResponses };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
