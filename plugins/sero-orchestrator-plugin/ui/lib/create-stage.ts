/**
 * Guided-create stage derivation (specs/09-ui-redesign.md, D1→D2→D3). The wizard
 * stage is a pure function of the watched loop's own state — no polling, no extra
 * flags — so it's kept here and unit-tested directly.
 */

import type { Loop } from '../../shared/types';

export type CreateStage = 'describe' | 'planning' | 'clarify' | 'review';

/**
 * - no loop id yet            → describe (the form)
 * - id set but loop not read  → planning (the AI is writing the plan)
 * - loop parked on a question → clarify (answer before it can plan)
 * - otherwise                 → review (read/refine the plan, save or activate)
 */
export function deriveCreateStage(loopId: string | null, loop: Loop | null): CreateStage {
  if (!loopId) return 'describe';
  if (!loop) return 'planning';
  if (loop.runtime.pendingInput) return 'clarify';
  return 'review';
}
