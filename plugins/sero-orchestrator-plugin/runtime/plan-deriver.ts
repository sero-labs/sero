// Verification-plan derivation (spec 05, D-19), extracted from the coordinator to
// keep it under the size limit. Runs the planner and writes the plan under the
// coordinator's own state mutation (single-writer). Used at create, on goal edit,
// and on a forced re-plan. The planner returns data only; this never runs the
// implementer or mutates loop state outside the one mutation here.

import type { AppRuntimeHost } from '@sero-ai/common';

import { isoNow, type Clock } from './clock';
import { goalHash, type PlanDerivation, type PlannerRunner } from './planner';
import type { StateStore } from './state-store';

export interface DerivePlanDeps {
  planner: PlannerRunner | null;
  store: StateStore;
  clock: Clock;
  host: AppRuntimeHost;
}

/**
 * Derive (or re-derive) a loop's verification plan and persist it. A freshly
 * derived `draft` loop becomes `active`; a planner that finds no sound way to
 * verify blocks the loop (`verification-unavailable`); a derivation failure leaves
 * the loop `draft` with a reason — it never runs with no definition of done.
 * `force` re-derives even when the goal hash is unchanged (e.g. the repo changed).
 */
export async function derivePlan(deps: DerivePlanDeps, loopId: string, force = false): Promise<void> {
  if (!deps.planner) return;
  const loop = await deps.store.getLoop(loopId);
  if (!loop) return;
  // Stamp the hash of the goal the planner actually sees, so a goal edited
  // mid-derivation is detected as stale (and re-derived) rather than mislabelled.
  const derivedGoalHash = goalHash(loop.goal);
  const upToDate = !force && loop.verificationPlan?.derivedFrom.goalHash === derivedGoalHash;
  if (upToDate && loop.status !== 'draft') return; // nothing to do

  const derivation: PlanDerivation | null = upToDate ? null : await deps.planner(loop, loop.verificationPlan);

  let failedDraft = false;
  let unavailable: string | undefined;
  await deps.store.updateLoop(loopId, (current) => {
    if (derivation) {
      current.verificationPlan = {
        criteria: derivation.criteria,
        stopConditions: derivation.stopConditions,
        derivedFrom: {
          goalHash: derivedGoalHash,
          at: isoNow(deps.clock),
          model: derivation.model,
          usage: derivation.usage,
        },
      };
    }
    const hasPlan = current.verificationPlan?.derivedFrom.goalHash === goalHash(current.goal);
    const unavailableCondition = current.verificationPlan?.stopConditions.find(
      (condition) => condition.kind === 'verification-unavailable',
    );
    if (current.status === 'draft') {
      if (!hasPlan) {
        current.statusReason =
          'Could not derive a verification plan from the goal yet. Edit the goal or try again.';
        failedDraft = true;
      } else if (unavailableCondition) {
        // The planner found no sound way to verify the goal (spec 05 §7); block
        // for the user rather than run blind.
        unavailable = unavailableCondition.reason ?? 'No sound way to verify this goal was found.';
        current.status = 'blocked';
        current.blockedReason = 'verification-unavailable';
        current.statusReason = unavailable;
      } else {
        current.status = 'active';
        current.statusReason = undefined;
      }
    }
    current.updatedAt = isoNow(deps.clock);
  });

  if (failedDraft || unavailable) {
    deps.host.notifications.notify({
      type: 'warning',
      source: 'orchestrator',
      message: unavailable
        ? `"${loop.title}" cannot be verified yet: ${unavailable}`
        : `Could not derive a verification plan for "${loop.title}".`,
    });
  }
}
