/**
 * Manual plan revision (the "Refine plan" action). Asks the LLM for a revised
 * plan, validates it, applies it as a revise-plan recovery, and re-derives the
 * schedule when the refinement changed the goal. Pure of persistence: it returns
 * the revised loop (or a failure with the reason to record), and the coordinator
 * persists. Split from coordinator.ts to keep it within the 500-LOC limit.
 */

import type { Loop, RecoveryDecision } from '../shared/types';
import type { OrchestratorHost } from './host';
import { proposeRevisedPlan } from './llm-decisions';
import { validateLoopPlan } from './schema';
import { applyRecovery } from './recovery-apply';
import { extractSchedule } from './schedule-extractor';
import { reapplySchedule } from './scheduler';

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

  // A refinement can change the GOAL itself (its stop condition or cadence).
  // The goal is the single source the stop-condition evaluator and the schedule
  // are derived from, so when it changes we update `prompt` (which the evaluator
  // reads) and re-derive the schedule, preserving existing fire counts.
  let next = applied.loop;
  const newGoal = proposal.goal?.trim();
  if (newGoal && newGoal !== loop.prompt) {
    const schedule = await extractSchedule(host, {
      prompt: newGoal,
      parentSessionId: loop.runtime.parentSessionId,
      loopId: loop.id,
    });
    next = { ...next, prompt: newGoal, triggers: reapplySchedule(host, loop.id, next.triggers, schedule) };
    host.log(`Loop ${loop.id} goal updated by refinement`);
  }
  return { loop: next };
}
