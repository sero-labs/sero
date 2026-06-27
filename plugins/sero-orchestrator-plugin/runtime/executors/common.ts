/**
 * Shared execution for background-agent and model steps: run through the
 * standard Sero path (host.runStructured), store the response as an artifact,
 * parse a StepOutcome, and assemble the StepAttempt. No Orchestrator tool,
 * command, or approval layer is added (D-02, FR-19).
 */

import { isModelTier } from '@sero-ai/common';
import type { Observation, StepAttempt, StepOutcome, UsageSummary } from '../../shared/types';
import { LEAN_TOOL_BASELINE } from '../../shared/constants';
import type { StepRunInput } from '../engine-types';
import { artifactPath, storeOutput } from '../artifacts';
import { extractJson } from '../schema';
import { resolveStepModel, type ResolvedStepModel } from '../model-resolution';
import { buildOutcomeRepair, buildStepTask, parseStepOutcome, parseStepOutcomeStrict, STEP_SYSTEM_PROMPT } from './prompt';

/**
 * In-session repair: if the step's reply isn't a valid StepOutcome, the same
 * subagent session is re-prompted (up to 2 follow-ups) for a corrected envelope
 * — far cheaper than spawning a separate evaluator subagent.
 */
const OUTCOME_REPAIR = {
  maxAttempts: 2,
  validate: (reply: string): string | null => {
    const parsed = parseStepOutcomeStrict(extractJson(reply));
    return parsed.ok ? null : buildOutcomeRepair(parsed.errors);
  },
};

export interface RunStepOptions {
  platformTools: 'all' | 'readOnly' | 'none';
  cwd?: string;
  /** Refines the parsed outcome (e.g. model schema validation). */
  refineOutcome?: (response: string, parsed: StepOutcome | undefined) => StepOutcome | undefined;
}

function toUsage(durationMs?: number, usage?: { inputTokens: number; outputTokens: number; totalTokens: number }): UsageSummary | undefined {
  if (!usage && durationMs === undefined) return undefined;
  return { ...usage, durationMs };
}

export async function runStepAttempt(input: StepRunInput, options: RunStepOptions): Promise<StepAttempt> {
  const { host, loop, run, step, attemptNumber, parentSessionId, workspace, signal } = input;
  const task = buildStepTask(loop, step);

  // Resolve the step's chosen model. Tiers and "no preference" pass straight
  // through; a pinned model that is no longer available falls back to MED (we
  // only pay the listAvailableModels call when a specific model is pinned).
  const requested = 'model' in step.execution ? step.execution.model : undefined;
  const resolved: ResolvedStepModel =
    requested && !isModelTier(requested)
      ? resolveStepModel(requested, await host.listAvailableModels())
      : { model: requested };

  // User context override (optional, set via the UI — not the planner). The
  // override REPLACES the base Sero system prompt (like the chat context editor);
  // the orchestrator's STEP_SYSTEM_PROMPT rides on as the step suffix so the
  // outcome envelope rules always survive. Disabled tools/skills are filtered out.
  const ctxOverride = loop.contextOverrides;

  // Per-step tool allowlist — only for background agents (which run with the
  // full platform surface). The planner picks the step's tools; a step with none
  // falls back to the lean coding baseline. Pure-model runs ('none') get no
  // allowlist. A lean allowlist also trims the per-tool prompt guidance.
  const stepTools =
    options.platformTools === 'all' && step.execution.type === 'background-agent'
      ? step.execution.tools && step.execution.tools.length > 0
        ? step.execution.tools
        : LEAN_TOOL_BASELINE
      : undefined;

  const result = await host.runStructured({
    task,
    systemPrompt: STEP_SYSTEM_PROMPT,
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
    repair: OUTCOME_REPAIR,
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
    outputPath: stored.artifactRef,
    observations: [observation],
    usage: toUsage(result.durationMs, result.usage),
    startedAt: observation.createdAt,
    endedAt: host.now(),
    error: result.error,
  };
}
