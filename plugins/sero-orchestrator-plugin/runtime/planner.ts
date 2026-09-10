/**
 * Planner — converts a user prompt into a validated PlanningResponse using the
 * standard Sero model execution path (host.runStructured). On validation
 * failure it performs exactly one repair pass before giving up (D-01, D-09).
 *
 * The planner may also reply with `clarifyingQuestions` instead of a plan when
 * the request is missing essential information; that surfaces as a `needsInput`
 * outcome (see specs/07-human-input.md) and skips the repair pass.
 */

import type { ContextAgentInfo, ContextToolInfo } from '@sero-ai/common';
import type { HumanQuestion, LoopDeliverySettings, PlanningResponse, SharedLoopDefinition, UsageSummary } from '../shared/types';
import type { OrchestratorHost } from './host';
import { PLANNING_SYSTEM_PROMPT, buildPlanningTask, buildRepairTask } from './planner-prompt';
import { extractJson, validatePlanningResponse } from './schema';
import { isRecord } from './structured-call';
import { parseHumanQuestions } from './human-input';
import { runPlanningWithRetry } from './planning-retry';
import { mergeUsage } from '../shared/usage';
import type { ModelRunResult } from './host';

export interface PlanRequest {
  prompt: string;
  parentSessionId: string;
  /** The loop's workspace isolation, so the planner adds the right placement rules. */
  useManagedWorktree: boolean;
  /** 'event-pr' swaps the pr delivery rules to push-to-the-PR's-own-branch (spec 15). */
  worktreeBranchSource?: 'new' | 'event-pr';
  /** The loop's effective delivery (user-chosen or derived) — the planner authors its steps, never picks it. */
  delivery: LoopDeliverySettings;
  /** The real tool catalog the planner picks each step's tools from. */
  toolCatalog?: ContextToolInfo[];
  /** The real agent-role catalog the planner may assign each background step to. */
  agentCatalog?: ContextAgentInfo[];
  /** Answered clarifying questions folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  /** Catalog installs: the curated definition the plan adapts (spec 14). */
  baseline?: SharedLoopDefinition;
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
  onUsage?: (usage: UsageSummary) => void | Promise<void>;
}

export type PlanOutcome =
  | { ok: true; response: PlanningResponse; modelResponses: string[]; usage?: UsageSummary }
  | { ok: false; needsInput: true; questions: HumanQuestion[]; modelResponses: string[]; usage?: UsageSummary }
  | { ok: false; needsInput?: false; errors: string[]; modelResponses: string[]; usage?: UsageSummary };

type Classified =
  | { kind: 'plan'; response: PlanningResponse }
  | { kind: 'questions'; questions: HumanQuestion[] }
  | { kind: 'error'; errors: string[] };

/** Classifies a raw planner reply: clarifying questions, a valid plan, or errors. */
function classify(text: string, delivery: LoopDeliverySettings): Classified {
  const parsed = extractJson(text);
  if (parsed === undefined) return { kind: 'error', errors: ['model response was not valid JSON'] };
  if (isRecord(parsed)) {
    const questions = parseHumanQuestions(parsed.clarifyingQuestions);
    if (questions) return { kind: 'questions', questions };
  }
  // Destination-aware validation: an external destination's plan must stage the
  // send behind an approval gate — caught here so the repair pass can fix it.
  const validated = validatePlanningResponse(parsed, delivery);
  return validated.ok ? { kind: 'plan', response: validated.value } : { kind: 'error', errors: validated.errors };
}

async function runPlanning(host: OrchestratorHost, req: PlanRequest, task: string): Promise<ModelRunResult> {
  return runPlanningWithRetry(host, {
    task,
    systemPrompt: PLANNING_SYSTEM_PROMPT,
    model: req.model,
    thinking: req.thinking,
    parentSessionId: req.parentSessionId,
    platformTools: 'none',
    signal: req.signal,
  }, req.onUsage);
}

function usageOf(result: ModelRunResult): UsageSummary {
  return result.usage ? { ...result.usage } : { incomplete: true };
}

export async function planLoop(host: OrchestratorHost, req: PlanRequest): Promise<PlanOutcome> {
  const modelResponses: string[] = [];

  let first: ModelRunResult;
  try {
    first = await runPlanning(host, req, buildPlanningTask({
      prompt: req.prompt,
      useManagedWorktree: req.useManagedWorktree,
      worktreeBranchSource: req.worktreeBranchSource,
      delivery: req.delivery,
      toolCatalog: req.toolCatalog,
      clarifications: req.clarifications,
      agentCatalog: req.agentCatalog,
      baseline: req.baseline,
    }));
  } catch (error) {
    return { ok: false, errors: [`planning model call failed: ${asMessage(error)}`], modelResponses };
  }
  const firstUsage = usageOf(first);
  if (first.response) modelResponses.push(first.response);
  if (first.error) return { ok: false, errors: [`planning model call failed: ${first.error}`], modelResponses, usage: firstUsage };

  const firstResult = classify(first.response, req.delivery);
  if (firstResult.kind === 'plan') return { ok: true, response: firstResult.response, modelResponses, usage: firstUsage };
  if (firstResult.kind === 'questions') return { ok: false, needsInput: true, questions: firstResult.questions, modelResponses, usage: firstUsage };

  // One repair pass for a structurally-invalid plan.
  host.log(`plan validation failed, attempting repair: ${firstResult.errors.join('; ')}`);
  let repaired: ModelRunResult;
  try {
    repaired = await runPlanning(host, req, buildRepairTask(req.prompt, first.response, firstResult.errors));
  } catch (error) {
    return { ok: false, errors: [`plan repair call failed: ${asMessage(error)}`, ...firstResult.errors], modelResponses, usage: firstUsage };
  }
  const repairedUsage = usageOf(repaired);
  if (repaired.response) modelResponses.push(repaired.response);
  const planningUsage = mergeUsage(firstUsage, repairedUsage);
  if (repaired.error) return { ok: false, errors: [`plan repair call failed: ${repaired.error}`, ...firstResult.errors], modelResponses, usage: planningUsage };

  const repairedResult = classify(repaired.response, req.delivery);
  if (repairedResult.kind === 'plan') return { ok: true, response: repairedResult.response, modelResponses, usage: planningUsage };
  if (repairedResult.kind === 'questions') return { ok: false, needsInput: true, questions: repairedResult.questions, modelResponses, usage: planningUsage };
  return { ok: false, errors: repairedResult.errors, modelResponses, usage: planningUsage };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
