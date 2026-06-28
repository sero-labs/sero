/**
 * Applies a RecoveryDecision to loop state (D-04, D-13). The decision itself is
 * produced by the recovery decider (Phase 5 LLM); this module performs the
 * structural validation and the loop mutation for each canonical decision.
 *
 *   retry-step | revise-step | revise-plan | skip-step | wait | block-loop
 *
 * `accept-step` is handled by the run engine (it re-applies a corrected outcome
 * through the same path normal outcomes take, so completion is uniform) and
 * never reaches here. Revised steps and plans are structurally validated before
 * they are applied.
 */

import type {
  Loop,
  LoopStepDefinition,
  PlanRevision,
  RecoveryDecision,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRetryableLoop, RECOVERABLE_STEP_STATUSES } from '../shared/recovery';
import { validateLoopPlan } from './schema';
import { initStepStates } from './plan-mapping';

/**
 * User-initiated Retry: resets every blocked/failed step back to pending, clears
 * any runtime block and blocked completion, and re-activates the loop so the
 * engine can run the reset steps again. Returns null when there is nothing to
 * recover (the caller surfaces "nothing to retry"). Succeeded steps are left
 * untouched, so prior work is never redone.
 */
export function retryStuckLoop(loop: Loop, now: string): Loop | null {
  if (!isRetryableLoop(loop)) return null;
  const stepStates = { ...loop.runtime.stepStates };
  for (const [id, state] of Object.entries(stepStates)) {
    if (RECOVERABLE_STEP_STATUSES.has(state.status)) {
      stepStates[id] = { ...state, status: 'pending', outcome: undefined, updatedAt: now };
    }
  }
  const blockedCompletion = loop.runtime.completion?.status === 'blocked';
  return {
    ...loop,
    status: 'active',
    runtime: {
      ...loop.runtime,
      stepStates,
      block: undefined,
      completion: blockedCompletion ? undefined : loop.runtime.completion,
    },
    updatedAt: now,
  };
}

export interface RecoveryApplication {
  loop: Loop;
  /** True when the run should stop after this decision (wait / block / invalid). */
  stop: boolean;
  /** Set when a revision was rejected for invalid structure. */
  rejection?: string;
}

function resetStep(loop: Loop, stepId: string, status: StepRuntimeState['status'], now: string): Loop {
  const prev = loop.runtime.stepStates[stepId];
  if (!prev) return loop;
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      stepStates: { ...loop.runtime.stepStates, [stepId]: { ...prev, status, outcome: undefined, updatedAt: now } },
    },
  };
}

function replaceStep(loop: Loop, revised: LoopStepDefinition): Loop {
  const steps = loop.plan.steps.map((s) => (s.id === revised.id ? revised : s));
  return { ...loop, plan: { ...loop.plan, steps } };
}

function recordRevision(loop: Loop, plan: Loop['plan'], reason: string, now: string): Loop {
  const revision: PlanRevision = {
    revision: plan.revision,
    previousRevision: loop.plan.revision,
    reason,
    proposedBy: 'model',
    status: 'applied',
    plan,
    createdAt: now,
    appliedAt: now,
  };
  return { ...loop, revisions: [...loop.revisions, revision] };
}

function blockLoop(loop: Loop, kind: 'recovery-block' | 'validation-error', reason: string, stepId: string, now: string): Loop {
  return {
    ...loop,
    status: 'blocked',
    runtime: { ...loop.runtime, block: { kind, reason, createdAt: now, sourceStepId: stepId } },
    updatedAt: now,
  };
}

export function applyRecovery(host: OrchestratorHost, loop: Loop, decision: RecoveryDecision): RecoveryApplication {
  const now = host.now();
  const stepId = decision.stepId;

  switch (decision.decision) {
    case 'retry-step':
      // Back to pending; readiness gates on attempts remaining.
      return { loop: resetStep(loop, stepId, 'pending', now), stop: false };

    case 'skip-step': {
      const prev = loop.runtime.stepStates[stepId];
      const skipped: Loop = prev
        ? {
            ...loop,
            runtime: {
              ...loop.runtime,
              stepStates: {
                ...loop.runtime.stepStates,
                [stepId]: { ...prev, status: 'skipped', outcome: { status: 'skipped', summary: decision.reason }, updatedAt: now },
              },
            },
            updatedAt: now,
          }
        : loop;
      return { loop: skipped, stop: false };
    }

    case 'revise-step': {
      if (!decision.revisedStep) {
        return { loop: blockLoop(loop, 'recovery-block', 'revise-step without a revised step', stepId, now), stop: true };
      }
      const candidate = { ...loop.plan, steps: loop.plan.steps.map((s) => (s.id === decision.revisedStep!.id ? decision.revisedStep! : s)) };
      const errors = validateLoopPlan(candidate);
      if (errors.length > 0) {
        return { loop, stop: true, rejection: `revised step invalid: ${errors.join('; ')}` };
      }
      const revised = resetStep(replaceStep(loop, decision.revisedStep), decision.revisedStep.id, 'pending', now);
      return { loop: { ...revised, updatedAt: now }, stop: false };
    }

    case 'revise-plan': {
      if (!decision.revisedPlan) {
        return { loop: blockLoop(loop, 'recovery-block', 'revise-plan without a revised plan', stepId, now), stop: true };
      }
      const errors = validateLoopPlan(decision.revisedPlan);
      if (errors.length > 0) {
        return { loop, stop: true, rejection: `revised plan invalid: ${errors.join('; ')}` };
      }
      const nextPlan = { ...decision.revisedPlan, revision: loop.plan.revision + 1 };
      // Preserve existing step states; initialize states for any new steps.
      const fresh = initStepStates(nextPlan, now);
      const stepStates = { ...fresh, ...pickExisting(loop, nextPlan) };
      const withPlan: Loop = {
        ...loop,
        plan: nextPlan,
        runtime: { ...loop.runtime, stepStates },
        updatedAt: now,
      };
      return { loop: recordRevision(withPlan, nextPlan, decision.reason, now), stop: false };
    }

    case 'wait':
      return { loop, stop: true };

    case 'block-loop':
      return { loop: blockLoop(loop, 'recovery-block', decision.reason, stepId, now), stop: true };

    default:
      // accept-step is handled upstream; any other (future/unknown) kind blocks safely.
      return { loop: blockLoop(loop, 'recovery-block', `unsupported recovery decision: ${decision.decision}`, stepId, now), stop: true };
  }
}

/** Existing step states for ids still present in the revised plan. */
function pickExisting(loop: Loop, plan: Loop['plan']): Record<string, StepRuntimeState> {
  const keep: Record<string, StepRuntimeState> = {};
  for (const step of plan.steps) {
    const prev = loop.runtime.stepStates[step.id];
    if (prev) keep[step.id] = prev;
  }
  return keep;
}
