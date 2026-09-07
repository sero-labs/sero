/**
 * Delivery: a receipt proves the artifact exists at its destination, and
 * acceptance proves it works. A milestone needs both before it is delivered,
 * and a delivered release moves the project to maintain.
 *
 * Either half can arrive last. The receipt usually lands first, while the run
 * is still verifying, so the owner's acceptance completes the pair. Both sides
 * call this, so the order they arrive in does not change the result.
 */

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
  if (next.phase === 'release') {
    const advanced = advancePhase({ ...next, stateLine: 'Released. Maintaining.' }, 'maintain', now, `release delivered at ${milestone.receipt}`);
    if (advanced.ok) {
      next = advanced.record;
      items.push('the release is delivered; maintain starts');
    }
  }
  return { record: next, items };
}
