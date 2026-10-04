/**
 * The `summary` action: the owner writes one short sentence for the overview.
 *
 * The overview shows the result the user will get, the current objective, what
 * there is to use and the answer to their last instruction. Those are these
 * four fields. They are display text only: no state, freshness or authority is
 * read from them, and a summary over its limit goes back to the owner to
 * shorten instead of being cut.
 */

import { checkSummary, OVERVIEW_FIELDS, type OverviewField, type SummarySource } from '../shared/agreement';
import { settle } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import { mutateRecord, type RecordStore } from './record-store';

export const SUMMARY_SOURCE_KINDS = ['plan', 'milestone', 'research', 'evidence', 'directive'] as const satisfies readonly SummarySource['kind'][];

/** These two describe finished or answered work, so they must name it. */
const NEEDS_SOURCE: readonly OverviewField[] = ['result', 'acknowledgement'];

const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

/** Does the named source exist on the record? A summary may not point at nothing. */
function sourceExists(record: ProjectRecord, source: SummarySource): boolean {
  switch (source.kind) {
    case 'plan':
      return record.working !== undefined;
    case 'milestone':
      return record.milestones.some((milestone) => milestone.id === source.id);
    case 'evidence':
      return record.milestones.some((milestone) => milestone.id === source.id && milestone.evidence !== null);
    case 'research':
      return record.research.some((entry) => entry.id === source.id);
    case 'directive':
      return record.directives.some((directive) => directive.id === source.id);
  }
}

export async function writeSummary(store: RecordStore, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const field = input.field;
  if (!field || !OVERVIEW_FIELDS.includes(field)) return refuse(`field is required: one of ${OVERVIEW_FIELDS.join(', ')}.`);
  const checked = checkSummary(field, input.text ?? '');
  if (!checked.ok) return refuse(checked.error);
  if (Boolean(input.sourceKind) !== Boolean(input.sourceId?.trim())) return refuse('sourceKind and sourceId go together: name the work this summary is about.');
  const source = input.sourceKind && input.sourceId ? { kind: input.sourceKind, id: input.sourceId.trim() } : undefined;
  if (!source && NEEDS_SOURCE.includes(field)) return refuse(`The ${field} summary must name its source with sourceKind and sourceId, so the user can open the full work.`);

  const saved = await mutateRecord(store, record.id, (fresh) => {
    if (source && !sourceExists(fresh, source)) return { error: `No ${source.kind} "${source.id}" is on this project.` };
    const overview = { ...fresh.overview, [field]: { text: checked.text, at: now, ...(source ? { source } : {}) } };
    return { record: settle({ ...fresh, overview }, now) };
  });
  if (!saved.ok) return refuse(saved.error);
  return { ok: true, text: `The ${field} summary is saved. It is shown to the user; it changes no state.` };
}
