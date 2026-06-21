/**
 * Shared execution for background-agent and model steps: run through the
 * standard Sero path (host.runStructured), store the response as an artifact,
 * parse a StepOutcome, and assemble the StepAttempt. No Orchestrator tool,
 * command, or approval layer is added (D-02, FR-19).
 */

import type { Observation, StepAttempt, StepOutcome, UsageSummary } from '../../shared/types';
import type { StepRunInput } from '../engine-types';
import { artifactPath, storeOutput } from '../artifacts';
import { buildStepTask, parseStepOutcome, STEP_SYSTEM_PROMPT } from './prompt';

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

  const result = await host.runStructured({
    task,
    systemPrompt: STEP_SYSTEM_PROMPT,
    model: 'model' in step.execution ? step.execution.model : undefined,
    thinking: 'thinking' in step.execution ? step.execution.thinking : undefined,
    parentSessionId,
    cwd: options.cwd,
    platformTools: options.platformTools,
    signal,
  });

  const stored = await storeOutput(host, loop.logPolicy, artifactPath(run.id, `${step.id}-a${attemptNumber}.txt`), result.response);
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
    outputPath: stored.artifactRef,
    observations: [observation],
    usage: toUsage(result.durationMs, result.usage),
    startedAt: observation.createdAt,
    endedAt: host.now(),
    error: result.error,
  };
}
