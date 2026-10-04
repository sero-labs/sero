/**
 * Delivery: a receipt proves the artifact exists at its destination, and
 * acceptance proves it works. A milestone needs both before it is delivered,
 * and a delivered release moves the project to maintain.
 *
 * Either half can arrive last. The receipt usually lands first, while the run
 * is still verifying, so the owner's acceptance completes the pair. Both sides
 * call this, so the order they arrive in does not change the result.
 */

import { closeDeliveredObjectives } from './objective-completion';
import { closeRun } from '../shared/runs';
import { planIsFinished } from '../shared/activity';
import { hasAgreement } from '../shared/agreement';
import { unaccountedRequirements } from '../shared/evidence-binding';
import { advancePhase } from '../shared/lifecycle';
import type { Milestone, ProjectRecord } from '../shared/record';

export interface DeliveryOutcome {
  record: ProjectRecord;
  /** What to tell the owner. Empty when the milestone is not delivered yet. */
  items: string[];
}

/** True when the owner has accepted the milestone on passed evidence. */
export function isAccepted(milestone: Milestone): boolean {
  return milestone.verification === 'accepted' || milestone.verification === 'delivered';
}

/**
 * Marks the milestone delivered when it has both a receipt and acceptance, and
 * advances a release to maintain. The milestone must already be on the record.
 */
export function applyDelivery(record: ProjectRecord, milestone: Milestone, now: string): DeliveryOutcome {
  if (!milestone.receipt || !isAccepted(milestone)) return { record, items: [] };
  const items: string[] = [];
  const delivered: Milestone = { ...milestone, verification: 'delivered' };
  let next: ProjectRecord = {
    ...record,
    milestones: record.milestones.map((m) => (m.id === delivered.id ? delivered : m)),
  };
  // The user's requirements are accounted for before delivery is reported:
  // each is proved by accepted, current evidence, or its gap is stated.
  const open = unaccountedRequirements(next);
  if (open.length > 0 && (next.phase === 'release' || next.phase === 'build')) {
    items.push(`the result has a receipt, but delivery is not complete: ${open.map((criterion) => `criterion ${criterion.id}`).join(', ')} ${open.length === 1 ? 'is' : 'are'} stated by the user and ${open.length === 1 ? 'has' : 'have'} no accepted current evidence. Run evidence that names ${open.length === 1 ? 'it' : 'them'} with --criteria, or state the gap with the working action`);
    return { record: closeDeliveredObjectives(next, now), items };
  }
  // An agreement has no separate release step. When its delivery lands in
  // build and nothing else is open, the status passes through release here.
  // A milestone set aside with its cancelled Room is not open work.
  if (hasAgreement(next) && next.phase === 'build' && planIsFinished(next)) {
    const released = advancePhase(next, 'release', now, 'every milestone accepted and the result delivered');
    if (released.ok) next = released.record;
  }
  if (next.phase === 'release') {
    const advanced = advancePhase({ ...next, stateLine: 'Released. Maintaining.' }, 'maintain', now, `release delivered at ${milestone.receipt}`);
    if (advanced.ok) {
      next = advanced.record;
      const initial = next.runs?.find((run) => run.kind === 'initial' && run.endedAt === null);
      if (initial) next = closeRun(next, initial.id, 'delivered', now);
      items.push('the release is delivered; maintain starts');
      // What the overview said about work in progress is now out of date. It is
      // removed here, so the page never claims a release still runs after it landed.
      if (next.overview?.result || next.overview?.objective) {
        const { result: _result, objective: _objective, ...kept } = next.overview;
        next = { ...next, overview: kept };
        items.push('the result and objective summaries were written before delivery and were removed; write the result summary again with the summary action, saying what the user has now');
      }
    }
  }
  next = closeDeliveredObjectives(next, now);
  return { record: next, items };
}

/**
 * Finishes a delivery that waited on the account of the user's requirements.
 * The receipt landed earlier; what was missing was proof, or a stated gap, for
 * something the user asked. Called after each change that can supply it.
 */
export function settleDelivery(record: ProjectRecord, now: string): DeliveryOutcome {
  if (!hasAgreement(record) || (record.phase !== 'build' && record.phase !== 'release')) return { record, items: [] };
  const delivered = record.milestones.find((milestone) => milestone.verification === 'delivered' && milestone.receipt);
  return delivered ? applyDelivery(record, delivered, now) : { record, items: [] };
}
