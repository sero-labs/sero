/**
 * What a piece of evidence proved, and whether it still proves it.
 *
 * File freshness alone is not enough. Evidence taken for one wording of a
 * criterion says nothing about a changed one, even when no file moved. So new
 * evidence names the criteria it covers as they read when the check was
 * requested, and the preview it rendered. It stays current while those read
 * the same. An edit that touches neither, such as a change of approach, leaves
 * it valid, so unrelated plan edits never force a recheck.
 *
 * Evidence saved before bindings carries none. It is read as it always was:
 * no revision is invented for it.
 *
 * The Architect chooses the checks and says which criteria each covers. This
 * file holds only the identity of what was checked. It selects no check.
 */

import type { AcceptanceCriterion } from './agreement';
import type { Milestone, ProjectRecord } from './record';

export interface EvidenceBinding {
  /** The working revision when the check was requested. Shown with the evidence. */
  workingRevision: number | null;
  /** The criteria the check covers, as they read then. */
  criteria: { id: string; text: string }[];
  /** The preview route the check rendered, or null. */
  previewRoute: string | null;
}

/** Snapshots what a check covers at the moment it is requested. A string is the refusal. */
export function bindEvidence(record: ProjectRecord, milestone: Milestone, criteriaIds: string[], route: string | null): EvidenceBinding | string {
  const known = record.working?.criteria ?? [];
  const criteria: EvidenceBinding['criteria'] = [];
  for (const id of new Set(criteriaIds)) {
    const criterion = known.find((item) => item.id === id);
    if (!criterion) return `Criterion "${id}" is not in the working interpretation. Name the ids this check covers, or record the criterion first with the working action.`;
    criteria.push({ id: criterion.id, text: criterion.text });
  }
  return { workingRevision: record.working?.revision ?? null, criteria, previewRoute: route ?? milestone.preview?.route ?? null };
}

/** The covered criteria that were changed or removed since the check, and a changed preview target. */
export function supersededBy(record: ProjectRecord, milestone: Milestone, binding: EvidenceBinding | undefined): string[] {
  if (!binding) return [];
  const current = record.working?.criteria ?? [];
  const reasons = binding.criteria
    .filter((covered) => current.find((item) => item.id === covered.id)?.text !== covered.text)
    .map((covered) => `criterion ${covered.id} changed after the check`);
  const route = milestone.preview?.route ?? null;
  if (binding.previewRoute !== null && route !== null && binding.previewRoute !== route) reasons.push(`the preview target changed from ${binding.previewRoute} to ${route}`);
  return reasons;
}

/** Evidence that passed, is fresh on files, and still proves what it covers. */
function provesNow(record: ProjectRecord, milestone: Milestone): boolean {
  const evidence = milestone.evidence;
  return !!evidence && evidence.passed && !evidence.stale && supersededBy(record, milestone, evidence.binding).length === 0;
}

const accepted = (milestone: Milestone): boolean => milestone.verification === 'accepted' || milestone.verification === 'delivered';

/** The milestone whose accepted, current evidence covers a criterion, if any. */
export function provenBy(record: ProjectRecord, criterionId: string): Milestone | undefined {
  return record.milestones.find((milestone) => accepted(milestone) && provesNow(record, milestone)
    && milestone.evidence?.binding?.criteria.some((covered) => covered.id === criterionId));
}

/**
 * The user's requirements that delivery has not accounted for: no accepted
 * current evidence covers them, and no gap is stated. Delivery is not reported
 * while this is not empty. A stated gap is an honest account; a missing one is not.
 */
export function unaccountedRequirements(record: ProjectRecord): AcceptanceCriterion[] {
  return (record.working?.criteria ?? []).filter((criterion) => criterion.userStated && !criterion.gap && !provenBy(record, criterion.id));
}

/**
 * Reopens the milestones whose proof a change superseded. Their evidence stays
 * on the record as history, and their acceptance no longer stands. A delivered
 * milestone keeps its receipt: that it was delivered is a fact, and the gap
 * shows in the account of the requirements instead.
 */
export function reopenSuperseded(record: ProjectRecord): { record: ProjectRecord; reopened: string[] } {
  const reopened: string[] = [];
  const milestones = record.milestones.map((milestone) => {
    const stands = milestone.verification === 'verified' || milestone.verification === 'accepted';
    if (!stands || supersededBy(record, milestone, milestone.evidence?.binding).length === 0) return milestone;
    reopened.push(milestone.id);
    return { ...milestone, status: 'verifying' as const, verification: 'reported' as const };
  });
  return reopened.length > 0 ? { record: { ...record, milestones }, reopened } : { record, reopened };
}
