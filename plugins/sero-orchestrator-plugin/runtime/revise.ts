/**
 * Manual loop revision (the "Refine plan" action). Asks the LLM for a revised
 * goal, plan, and optional management limits. It validates and applies the plan,
 * then re-derives the schedule when the goal changed. Pure of persistence: it
 * returns the revised loop or failure for the coordinator to persist. Split from
 * coordinator.ts to keep it within the 500-LOC limit.
 */

import type { Loop, RecoveryDecision } from '../shared/types';
import type { OrchestratorHost } from './host';
import { proposeRevisedPlan } from './llm-decisions';
import { validateLoopPlan } from './schema';
import { applyRecovery } from './recovery-apply';
import { extractTriggers } from './trigger-extractor';
import { reapplyExtractedTriggers } from './scheduler';

export interface RevisionOutcome {
  /** The applied, revised loop — caller persists it. */
  loop?: Loop;
  /** User-facing error (shown in the UI) when the revision failed. */
  error?: string;
  /** Reason to record on the rejected revision; defaults to `error`. */
  rejectionReason?: string;
}

export async function buildRevisedLoop(
  host: OrchestratorHost,
  loop: Loop,
  prompt?: string,
): Promise<RevisionOutcome> {
  const proposal = await proposeRevisedPlan(host, loop, prompt);
  if (proposal.error || !proposal.plan) {
    return { error: proposal.error ?? 'Revision failed.', rejectionReason: proposal.error ?? 'no plan returned' };
  }
  const errors = validateLoopPlan(proposal.plan);
  if (errors.length > 0) {
    return { error: `Revised plan invalid: ${errors.join('; ')}`, rejectionReason: errors.join('; ') };
  }

  const decision: RecoveryDecision = {
    id: host.newId('recovery'),
    stepId: loop.plan.steps[0]?.id ?? '',
    failedAttemptId: '',
    decision: 'revise-plan',
    reason: prompt ?? 'manual revision',
    revisedPlan: proposal.plan,
    createdAt: host.now(),
    modelResponsePath: proposal.modelResponsePath,
  };
  const applied = applyRecovery(host, loop, decision);
  if (applied.rejection) {
    return { error: applied.rejection, rejectionReason: applied.rejection };
  }

  // A refinement can change the GOAL itself (its stop condition, cadence, or
  // events). The goal is the single source the stop-condition evaluator and the
  // triggers are derived from, so when it changes we update `prompt` (which the
  // evaluator reads) and re-derive the triggers, preserving existing fire counts.
  let next = applied.loop;
  const newGoal = proposal.goal?.trim();
  if (newGoal && newGoal !== loop.prompt) {
    const extraction = await extractTriggers(host, {
      prompt: newGoal,
      parentSessionId: loop.runtime.parentSessionId,
      loopId: loop.id,
    });
    next = { ...next, prompt: newGoal, triggers: reapplyExtractedTriggers(host, loop.id, next.triggers, extraction) };
    host.log(`Loop ${loop.id} goal updated by refinement`);
  }
  if (proposal.limits) {
    const resumesManagementBlock = loop.status === 'blocked' && loop.runtime.block?.kind === 'management-limit';
    next = {
      ...next,
      status: resumesManagementBlock ? 'active' : next.status,
      limits: { ...next.limits, ...proposal.limits },
      runtime: resumesManagementBlock ? { ...next.runtime, block: undefined } : next.runtime,
      updatedAt: host.now(),
    };
  }
  return { loop: next };
}
