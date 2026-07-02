/**
 * Shared execution for background-agent and model steps: run through the
 * standard Sero path (host.runStructured), store the response as an artifact,
 * parse a StepOutcome, and assemble the StepAttempt. No Orchestrator tool,
 * command, or approval layer is added (D-02, FR-19).
 */

import { isModelTier } from '@sero-ai/common';
import type { Loop, LoopStepDefinition, Observation, StepAttempt, StepOutcome, UsageSummary } from '../../shared/types';
import { DEFAULT_TOOLS } from '../../shared/constants';
import type { StepRunInput } from '../engine-types';
import { artifactPath, storeOutput } from '../artifacts';
import { extractJson } from '../schema';
import { resolveStepModel, type ResolvedStepModel } from '../model-resolution';
import { buildOutcomeRepair, buildStepTask, parseStepOutcome, parseStepOutcomeStrict, STEP_SYSTEM_PROMPT } from './prompt';
import { formatRouteRepair, missingRouteVariables } from '../route-contract';
import { deliveryProblems, formatDeliveryRepair, receiptRequirement } from '../delivery/delivery-contract';

/**
 * In-session repair: if the step's reply isn't a valid StepOutcome — or a
 * `succeeded` reply omits a routing variable a later step branches on, or a
 * completion claim lacks its required delivery receipt — the same subagent
 * session is re-prompted (up to 2 follow-ups) for a corrected envelope, far
 * cheaper than spawning a separate evaluator subagent. Enforcing the contracts
 * here catches the omission while the agent still has its context, so a branch
 * is decided (and a delivery proven) rather than silently skipped.
 */
function outcomeRepair(loop: Loop, step: LoopStepDefinition) {
  return {
    maxAttempts: 2,
    validate: (reply: string): string | null => {
      const parsed = parseStepOutcomeStrict(extractJson(reply));
      if (!parsed.ok) return buildOutcomeRepair(parsed.errors);
      const missing = missingRouteVariables(loop, step, parsed.value);
      if (missing.length > 0) return formatRouteRepair(missing);
      const requirement = receiptRequirement(loop, step);
      if (requirement) {
        const problems = deliveryProblems(requirement, parsed.value);
        if (problems.length > 0) return formatDeliveryRepair(requirement, problems);
      }
      return null;
    },
  };
}

export interface RunStepOptions {
  platformTools: 'all' | 'readOnly' | 'none';
  cwd?: string;
  /** Refines the parsed outcome (e.g. model schema validation). */
  refineOutcome?: (response: string, parsed: StepOutcome | undefined) => StepOutcome | undefined;
}

function toUsage(durationMs?: number, usage?: { inputTokens: number; outputTokens: number; totalTokens: number; costUsd?: number }): UsageSummary | undefined {
  if (!usage && durationMs === undefined) return undefined;
  return { ...usage, durationMs };
}

export async function runStepAttempt(input: StepRunInput, options: RunStepOptions): Promise<StepAttempt> {
  const { host, loop, run, step, attemptNumber, parentSessionId, workspace, signal } = input;
  const task = buildStepTask(loop, step, run);

  // Resolve the step's chosen model. Tiers and "no preference" pass straight
  // through; a pinned model that is no longer available falls back to MED (we
  // only pay the listAvailableModels call when a specific model is pinned).
  const requested = 'model' in step.execution ? step.execution.model : undefined;
  const resolved: ResolvedStepModel =
    requested && !isModelTier(requested)
      ? resolveStepModel(requested, await host.listAvailableModels())
      : { model: requested };

  // Named agent role (background-agent steps only; planner-picked or user-set).
  // Verify it against the real catalog before the run — only when one is pinned —
  // so an unknown role (deleted/renamed since planning, or a planner mistake)
  // falls back to the default ad-hoc agent with a warning instead of hard-failing
  // the step (spec 11). With a role, the step contract rides on appendSystemPrompt
  // (the role's .md body is the base); without one, on the ad-hoc systemPrompt.
  const requestedAgent = step.execution.type === 'background-agent' ? step.execution.agent : undefined;
  let agent: string | undefined;
  let agentFallback: { requestedAgent: string } | undefined;
  if (requestedAgent) {
    const known = (await host.listAgentCatalog()).some((a) => a.name === requestedAgent);
    if (known) agent = requestedAgent;
    else agentFallback = { requestedAgent };
  }

  // User context override (optional, set via the UI — not the planner). The
  // override REPLACES the base Sero system prompt (like the chat context editor);
  // the orchestrator's STEP_SYSTEM_PROMPT rides on as the step suffix so the
  // outcome envelope rules always survive. Disabled tools/skills are filtered out.
  const ctxOverride = loop.contextOverrides;

  // Per-step tool allowlist — only for background agents (which run with the
  // full platform surface). The default tools are ALWAYS included; the planner's
  // per-step picks are layered on top. Pure-model runs ('none') get no allowlist.
  // A lean allowlist also trims the per-tool prompt guidance.
  const stepTools =
    options.platformTools === 'all' && step.execution.type === 'background-agent'
      ? [...new Set([...DEFAULT_TOOLS, ...(step.execution.tools ?? [])])]
      : undefined;

  const result = await host.runStructured({
    task,
    agent,
    // The step contract must always apply: with a named agent it rides on top of
    // the agent body via appendSystemPrompt; with no agent we use the ad-hoc
    // systemPrompt channel (which would be displaced by a named agent).
    systemPrompt: agent ? undefined : STEP_SYSTEM_PROMPT,
    appendSystemPrompt: agent ? [STEP_SYSTEM_PROMPT] : undefined,
    systemPromptOverride: ctxOverride?.systemPrompt ?? undefined,
    model: resolved.model,
    thinking: 'thinking' in step.execution ? step.execution.thinking : undefined,
    parentSessionId,
    cwd: options.cwd,
    platformTools: options.platformTools,
    tools: stepTools,
    disabledTools: ctxOverride?.disabledTools,
    disabledSkills: ctxOverride?.disabledSkills,
    signal,
    repair: outcomeRepair(loop, step),
  });

  const stored = await storeOutput(host, loop.logPolicy, artifactPath(loop.id, run.id, `${step.id}-a${attemptNumber}.txt`), result.response);
  const parsed = result.error ? undefined : parseStepOutcome(result.response);
  const outcome = options.refineOutcome ? options.refineOutcome(result.response, parsed) : parsed;

  const observation: Observation = {
    id: host.newId('obs'),
    source: step.execution.type === 'model' ? 'model' : 'background-agent',
    summary: stored.inline.slice(0, 280),
    artifactPath: stored.artifactRef,
    createdAt: host.now(),
  };

  return {
    id: host.newId('attempt'),
    stepId: step.id,
    attemptNumber,
    parentSessionId,
    executionType: step.execution.type,
    status: result.error ? 'failed' : 'completed',
    outcome,
    workspace,
    model: result.modelId,
    modelFallback: resolved.fallbackFrom ? { requestedModel: resolved.fallbackFrom } : undefined,
    agentFallback,
    outputPath: stored.artifactRef,
    observations: [observation],
    usage: toUsage(result.durationMs, result.usage),
    startedAt: observation.createdAt,
    endedAt: host.now(),
    error: result.error,
  };
}
