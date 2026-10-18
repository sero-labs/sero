/**
 * The `work --operation wait` action: the owner ends a wake by naming
 * something it can see end, and waiting for it.
 *
 * - `child`: a Room or Workflow it started, named by milestone or research id.
 * - `process`: a dev server Sero manages in the project's workspace, by server id.
 * - `ci`: the CI checks of a branch or commit in the project's repository.
 *
 * Order: the source is read once to refuse a wait that could never end, the
 * intent is saved, then the source is read again, so a completion that landed
 * just before this call is observed rather than missed. The wake comes later,
 * through the one owner scheduler, and never from this call.
 *
 * Nothing the owner types is evaluated: each kind names a source the runtime reads.
 */

import { appendHistory, settle } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { Milestone, ProjectRecord } from '../shared/record';
import { activeDirectMilestone, isActiveDirect } from '../shared/direct-execution';
import { manualResumeMessage, registerWait, WAIT_SOURCE_KINDS, waitMayWake, type WaitRegistration, type WaitSourceKind } from '../shared/waits';
import { resolveLinked } from './linked-work';
import { mutateRecord, type RecordStore } from './record-store';
import type { TurnOutcomes } from './turn-outcomes';
import type { WaitReconciler } from './wait-reconciler';

export interface OwnerWaitDeps {
  store: RecordStore;
  outcomes: TurnOutcomes;
  newId(prefix: string): string;
  waits?: Pick<WaitReconciler, 'reconcile' | 'admit'>;
}

/** A CI wait reads GitHub until its checks conclude, so it always ends: by default after six hours. */
const CI_DEFAULT_DEADLINE_MINUTES = 360;

const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

interface Resolved {
  source: { kind: WaitSourceKind; id: string };
  owner: WaitRegistration['owner'];
  milestone?: Milestone;
  label: string;
}

/** The milestone a process or CI wait belongs to: the one named, or the one the owner is doing itself. */
function ownerMilestone(record: ProjectRecord, input: OwnerActionInput): Milestone | string {
  const id = input.milestoneId?.trim();
  if (!id) return activeDirectMilestone(record) ?? 'Name the milestone this wait belongs to with --milestoneId.';
  return record.milestones.find((milestone) => milestone.id === id) ?? `No milestone "${id}".`;
}

async function resolve(deps: OwnerWaitDeps, record: ProjectRecord, kind: WaitSourceKind, target: string, input: OwnerActionInput): Promise<Resolved | string> {
  if (kind === 'child') {
    const linked = resolveLinked(record, target);
    if (typeof linked === 'string') return linked;
    if ('completed' in linked) return `"${target}" already finished. Its result: ${linked.completed}`;
    const milestone = linked.milestone;
    return {
      source: { kind, id: linked.id },
      owner: milestone
        ? { milestoneId: milestone.id, executionId: isActiveDirect(milestone.direct) ? milestone.direct.id : null }
        : { milestoneId: null, researchId: linked.source.id, executionId: null },
      ...(milestone ? { milestone } : {}),
      label: `${linked.kind} ${linked.id} (${target})`,
    };
  }
  const milestone = ownerMilestone(record, input);
  if (typeof milestone === 'string') return milestone;
  const refused = await deps.waits?.admit(record, kind, target);
  if (refused) return refused;
  return {
    source: { kind, id: target },
    owner: { milestoneId: milestone.id, executionId: isActiveDirect(milestone.direct) ? milestone.direct.id : null },
    milestone,
    label: kind === 'process' ? `dev server ${target}` : `the CI checks of ${target}`,
  };
}

export async function ownerWait(deps: OwnerWaitDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const kind = input.source?.trim() ?? '';
  const target = input.target?.trim() ?? '';
  if (!kind || !target) return refuse(`source and target are required. source is one of ${WAIT_SOURCE_KINDS.join(', ')}; target is the milestone or research id for child, the dev server id for process, or the branch or commit for ci.`);
  if (!deps.waits) return refuse('This runtime cannot observe waits, so none is registered. End the wake with sleep or blocked.');
  if (!(WAIT_SOURCE_KINDS as readonly string[]).includes(kind)) return refuse(manualResumeMessage(kind, target));
  const unanswered = record.directives.find((directive) => directive.reply === null);
  if (unanswered) return refuse(`Reply to directive ${unanswered.id} before you wait.`);
  if (!waitMayWake(record)) return refuse(record.overlay ? `The project is ${record.overlay}; a wait could not wake you now.` : 'The project may not start work now.');

  const resolved = await resolve(deps, record, kind as WaitSourceKind, target, input);
  if (typeof resolved === 'string') return refuse(resolved);
  const { source, owner, milestone, label } = resolved;
  const id = deps.newId('wait');
  const saved = await mutateRecord(deps.store, record.id, (fresh) => {
    const result = registerWait(fresh, { id, now, source, owner, deadlineMinutes: input.deadlineMinutes ?? (source.kind === 'ci' ? CI_DEFAULT_DEADLINE_MINUTES : undefined) });
    if (!result.ok) return { error: result.reason };
    if (!result.created) return { record: fresh };
    const subject = milestone ? { kind: 'milestone' as const, id: milestone.id, label: milestone.title } : undefined;
    return { record: settle(appendHistory(result.record, now, `Architect is waiting for ${label} to end`, subject), now) };
  });
  if (!saved.ok) return refuse(saved.error);
  const wait = saved.record.waits?.find((item) => item.source.kind === source.kind && item.source.id === source.id && item.outcome === null)
    ?? saved.record.waits?.findLast((item) => item.source.kind === source.kind && item.source.id === source.id);
  // Persisted, and the sources are followed. Now read the source once, so a
  // completion before this call is not lost.
  await deps.waits.reconcile(record.id);
  deps.outcomes.declare(record.id, 'wait');
  return {
    ok: true,
    text: `Recorded. You wait for ${label}${wait?.deadline ? ` until ${wait.deadline} at most` : ''}. You are woken once when it ends, and also if it fails or the deadline passes; a failure is not completion. This wake is over.`,
    details: { waitId: wait?.id ?? id, source },
  };
}
