/**
 * Guided-create stage derivation (specs/09-ui-redesign.md, D1→D2→D3). The wizard
 * stage is a pure function of the watched loop's own state — no polling, no extra
 * flags — so it's kept here and unit-tested directly.
 */

import type { Loop } from '../../shared/types';

export type CreateStage = 'describe' | 'planning' | 'clarify' | 'review';

/**
 * - no loop id yet             → describe (the form)
 * - id set but loop not read  → planning (the AI is writing the plan)
 * - loop parked on a question → clarify (answer before it can plan)
 * - plan not complete yet     → planning (a re-plan after the answers)
 * - otherwise                 → review (read/refine the plan, save or activate)
 */
export function deriveCreateStage(loopId: string | null, loop: Loop | null): CreateStage {
  if (!loopId) return 'describe';
  if (!loop) return 'planning';
  if (loop.runtime.pendingInput) return 'clarify';
  // Answering the planner's questions runs the planner again. The draft stays
  // on screen through that call, so without this the reader would see a plan
  // that is already known to be out of date instead of the wait.
  if (loop.creation && !loop.creation.complete) return 'planning';
  return 'review';
}
