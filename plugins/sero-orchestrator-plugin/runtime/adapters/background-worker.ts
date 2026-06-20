// Background-worker execution adapter (Phase 3). The coordinator core owns the
// whole attempt lifecycle (workdir, baseRef, dirty-root gate, budgets, checks,
// stop rules, transitions); this adapter performs exactly one step — make the
// change and report what changed at the attempt cwd (D-06) — and returns an
// AttemptExecutionResult. It never touches loop state.
//
// Flow: build an implementer WorkerInstruction (workers.ts) → run it via
// `host.subagents.runStructured` with the canonical cwd + parentSessionId (D-15)
// → measure the diff with git at that same cwd → parse the worker's fenced JSON
// (D-08). Live output streams automatically: the subagent tracker emits keyed by
// (workspaceId, parentSessionId), which the shell's subagent activity UI renders
// — no new channel (reuse-existing-streaming-onliveoutput).

import type { AppRuntimeSubagentResult } from '@sero-ai/common';

import type { LoopAttempt, LoopGoal } from '../../shared/types';
import type {
  AttemptAdapter,
  AttemptContext,
  AttemptExecutionResult,
  AttemptOutcomeStatus,
} from '../adapter';
import type { WorkerSessionRegistry } from '../recursion-guard';
import { computeDiffFingerprint, listChangedFiles } from '../vcs';
import {
  buildImplementerInstruction,
  parseWorkerOutput,
  type WorkerOutput,
} from '../workers';

export interface BackgroundWorkerAdapterDeps {
  /** Tracks worker parent sessions so the coordinator can reject worker-sourced requests (D-16). */
  workerSessions: WorkerSessionRegistry;
}

/** Create the background-worker adapter the coordinator registers by default. */
export function createBackgroundWorkerAdapter(
  deps: BackgroundWorkerAdapterDeps,
): AttemptAdapter {
  return {
    mode: 'background-worker',
    execute: (ctx) => execute(deps, ctx),
  };
}

async function execute(
  deps: BackgroundWorkerAdapterDeps,
  ctx: AttemptContext,
): Promise<AttemptExecutionResult> {
  const instruction = buildImplementerInstruction({
    loop: ctx.loop,
    priorAttempt: priorFinishedAttempt(ctx.loop, ctx.attempt),
  });
  // Record the (redacted) instruction on the attempt for replay (D-08/D-13).
  ctx.attempt.workerInstruction = instruction;

  const parentSessionId = ctx.attempt.parentSessionId;
  deps.workerSessions.markActive(parentSessionId);
  let result: AppRuntimeSubagentResult;
  try {
    result = await ctx.host.subagents.runStructured({
      task: instruction.taskPrompt,
      systemPrompt: instruction.systemPrompt,
      platformTools: instruction.platformTools,
      isolated: instruction.isolated,
      parentSessionId,
      workspaceId: ctx.workspaceId,
      cwd: ctx.cwd,
      model: instruction.model,
      thinking: instruction.thinking,
      timeoutMs: ctx.timeoutMs ?? instruction.timeoutMs,
      signal: ctx.signal,
    });
  } finally {
    deps.workerSessions.clear(parentSessionId);
  }

  const status = outcomeStatus(result);

  // On cancellation, skip the git probes — the loop will record it cancelled.
  if (ctx.signal.aborted) {
    return { status: 'aborted', changedFiles: [], response: result.response, error: result.error };
  }

  const changedFiles = await listChangedFiles(ctx.host, ctx.workspaceId, ctx.cwd);
  const diffFingerprint =
    changedFiles.length > 0
      ? await computeDiffFingerprint(ctx.host, ctx.workspaceId, ctx.cwd, ctx.attempt.baseRef)
      : undefined;
  const parsed: WorkerOutput | null = parseWorkerOutput(result.response);

  return {
    status,
    changedFiles,
    diffFingerprint,
    response: result.response,
    summary: parsed?.summary ?? (status === 'completed' ? undefined : result.error),
    usage: result.usage,
    model: result.modelId,
    error: result.error,
  };
}

/** Map the subagent result to an attempt outcome status (02 §Subagents). */
function outcomeStatus(result: AppRuntimeSubagentResult): AttemptOutcomeStatus {
  if (!result.error) return 'completed';
  return result.error.startsWith('Aborted') ? 'aborted' : 'error';
}

/** The most recent finished attempt (its failure becomes next-attempt context). */
function priorFinishedAttempt(loop: LoopGoal, current: LoopAttempt): LoopAttempt | undefined {
  for (let index = loop.attempts.length - 1; index >= 0; index--) {
    const attempt = loop.attempts[index]!;
    if (attempt.id !== current.id && attempt.status !== 'running') return attempt;
  }
  return undefined;
}
