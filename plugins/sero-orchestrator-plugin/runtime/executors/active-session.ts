/**
 * Active-session step executor.
 *
 * Phase 4 placeholder: returns a failed attempt with a clear reason so plans
 * that mix in an active-session step do not crash a run. Phase 6 replaces this
 * with the real host.session implementation (send + observe by turnId).
 */

import type { StepExecutor } from '../engine-types';
import type { StepAttempt } from '../../shared/types';

export const activeSessionExecutor: StepExecutor = {
  async run(input): Promise<StepAttempt> {
    const now = input.host.now();
    return {
      id: input.host.newId('attempt'),
      stepId: input.step.id,
      attemptNumber: input.attemptNumber,
      parentSessionId: input.parentSessionId,
      executionType: 'active-session',
      status: 'failed',
      outcome: { status: 'failed', summary: 'active-session execution is not available yet' },
      observations: [],
      startedAt: now,
      endedAt: now,
      error: 'active-session execution not implemented',
    };
  },
};
