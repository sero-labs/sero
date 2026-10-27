import { isSetAside } from '../../shared/activity';
import { provenBy, supersededBy } from '../../shared/evidence-binding';
import { MAINTENANCE_MILESTONE_ID } from '../../shared/maintenance';
import type { Milestone, ProjectRecord } from '../../shared/record';

/** The recorded check can remain useful history after its proof expires. */
export function evidenceProblem(record: ProjectRecord, milestone: Milestone): string | null {
  if (record.pendingEvidence?.some((pending) => pending.milestoneId === milestone.id)) return 'New checks are still running';
  const evidence = milestone.evidence;
  if (!evidence) return 'No checks recorded';
  if (evidence.stale) return 'Files changed after these checks';
  const changed = supersededBy(record, milestone, evidence.binding);
  if (changed.length) return changed.join('; ');
  if (!evidence.commit) return 'Checked revision unavailable';
  if (!evidence.passed) return 'Checks did not pass';
  return null;
}

export function resultMilestones(record: ProjectRecord): Milestone[] {
  return record.milestones.filter((milestone) => milestone.id !== MAINTENANCE_MILESTONE_ID);
}

/** Requirements without current accepted proof stay visible, including explicit gaps. */
export function resultGaps(record: ProjectRecord): { id: string; text: string; reason: string }[] {
  return (record.working?.criteria ?? []).flatMap((criterion) => {
    if (!criterion.gap && provenBy(record, criterion.id)) return [];
    return [{ id: criterion.id, text: criterion.text, reason: criterion.gap || 'No accepted current evidence covers this requirement.' }];
  });
}

/** Presentation only: never changes acceptance or validates a delivery receipt. */
export function resultNeedsReview(record: ProjectRecord): boolean {
  const milestones = resultMilestones(record);
  return milestones.length === 0 || !record.working?.criteria.length || resultGaps(record).length > 0 || milestones.some((milestone) =>
    isSetAside(milestone) || evidenceProblem(record, milestone) !== null
    || (milestone.verification !== 'accepted' && milestone.verification !== 'delivered'));
}

export function hasResult(record: ProjectRecord): boolean {
  return resultMilestones(record).some((milestone) => milestone.verification !== null || milestone.evidence !== null || milestone.receipt !== null);
}

/** Receipts are opaque unless they are an ordinary web URL. Never execute a receipt. */
export function receiptUrl(receipt: string): string | null {
  try {
    const url = new URL(receipt);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
