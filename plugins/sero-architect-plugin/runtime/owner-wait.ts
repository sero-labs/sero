/**
 * The `work --operation wait` action: the owner ends a wake by naming a
 * Room or Workflow it started and waiting for it to end.
 *
 * Order: the intent is saved first, then the source is read, so a completion
 * that landed just before this call is observed rather than missed. The wake
 * comes later, through the one owner scheduler, and never from this call.
 *
 * The source is named by the project's own milestone or research id and
 * resolved from the record. Nothing the owner types is evaluated.
 */

import { appendHistory, settle } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import { isActiveDirect } from '../shared/direct-execution';
import { manualResumeMessage, registerWait, WAIT_SOURCE_KINDS, waitMayWake } from '../shared/waits';
import { resolveLinked } from './linked-work';
import { mutateRecord, type RecordStore } from './record-store';
import type { TurnOutcomes } from './turn-outcomes';
import type { WaitReconciler } from './wait-reconciler';

export interface OwnerWaitDeps {
  store: RecordStore;
  outcomes: TurnOutcomes;
  newId(prefix: string): string;
  waits?: Pick<WaitReconciler, 'reconcile'>;
}

const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

export async function ownerWait(deps: OwnerWaitDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const kind = input.source?.trim() ?? '';
  const target = input.target?.trim() ?? '';
  if (!kind || !target) return refuse(`source and target are required. source is one of ${WAIT_SOURCE_KINDS.join(', ')}; target is the milestone or research id.`);
  if (!deps.waits) return refuse('This runtime cannot observe waits, so none is registered. End the wake with sleep or blocked.');
  if (kind !== 'child') return refuse(manualResumeMessage(kind, target));
  const unanswered = record.directives.find((directive) => directive.reply === null);
  if (unanswered) return refuse(`Reply to directive ${unanswered.id} before you wait.`);
  if (!waitMayWake(record)) return refuse(record.overlay ? `The project is ${record.overlay}; a wait could not wake you now.` : 'The project may not start work now.');

  const linked = resolveLinked(record, target);
  if (typeof linked === 'string') return refuse(linked);
  if ('completed' in linked) return refuse(`"${target}" already finished. Its result: ${linked.completed}`);
  const milestone = linked.milestone;
  const owner = milestone
    ? { milestoneId: milestone.id, executionId: isActiveDirect(milestone.direct) ? milestone.direct.id : null }
    : { milestoneId: null, researchId: linked.source.id, executionId: null };
  const id = deps.newId('wait');
  const saved = await mutateRecord(deps.store, record.id, (fresh) => {
    const result = registerWait(fresh, { id, now, source: { kind, id: linked.id }, owner, deadlineMinutes: input.deadlineMinutes });
    if (!result.ok) return { error: result.reason };
    if (!result.created) return { record: fresh };
    const subject = milestone ? { kind: 'milestone' as const, id: milestone.id, label: milestone.title } : undefined;
    return { record: settle(appendHistory(result.record, now, `Architect is waiting for ${linked.kind} ${linked.id} to end`, subject), now) };
  });
  if (!saved.ok) return refuse(saved.error);
  const wait = saved.record.waits?.find((item) => item.source.id === linked.id && item.outcome === null) ?? saved.record.waits?.findLast((item) => item.source.id === linked.id);
  // Persisted, and the dispatch watch follows the same index files. Now read
  // the source once, so a completion before this call is not lost.
  await deps.waits.reconcile(record.id);
  deps.outcomes.declare(record.id, 'wait');
  return {
    ok: true,
    text: `Recorded. You wait for ${linked.kind} ${linked.id} (${target})${wait?.deadline ? ` until ${wait.deadline} at most` : ''}. You are woken once when it ends, and also if it fails or the deadline passes; a failure is not completion. This wake is over.`,
    details: { waitId: wait?.id ?? id, source: { kind, id: linked.id } },
  };
}
