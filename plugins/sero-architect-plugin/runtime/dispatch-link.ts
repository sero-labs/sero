/**
 * Performs one dispatch and links it to its milestone. Shared by the owner's
 * dispatch action and by the answer to a forced-escalation decision, so both
 * paths write the same record shape.
 */

import { settle } from '../shared/lifecycle';
import type { DispatchDestination, DispatchKind } from '../shared/owner-actions';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { OwnerServices } from './owner-actions';
import type { RecordStore } from './record-store';

export interface DispatchRequest {
  kind: DispatchKind;
  prompt: string;
  destination: DispatchDestination | null;
  maxCostUsd: number | null;
}

export async function performDispatch(
  store: RecordStore,
  services: OwnerServices,
  record: ProjectRecord,
  milestone: Milestone,
  request: DispatchRequest,
  now: string,
): Promise<{ record: ProjectRecord; milestone: Milestone }> {
  const intent = { kind: request.kind, destination: request.destination, startedAt: now };
  const prepared = await store.update(record.id, (fresh) => {
    const current = fresh.milestones.find((item) => item.id === milestone.id);
    if (!current || current.dispatch || current.pendingDispatch) return null;
    const milestones = fresh.milestones.map((item) =>
      item.id === milestone.id ? { ...item, pendingDispatch: intent } : item,
    );
    return settle({ ...fresh, milestones }, now);
  });
  if (!prepared) throw new Error(`Milestone ${milestone.id} could not reserve its dispatch.`);
  const preparedMilestone = prepared.milestones.find((item) => item.id === milestone.id);
  if (!preparedMilestone) throw new Error(`Milestone ${milestone.id} is no longer on this project.`);

  // The dispatch itself is slow and must stay outside the store's write queue;
  // the durable intent prevents a crash or write failure from creating a duplicate run.
  let link: Awaited<ReturnType<OwnerServices['dispatch']>>;
  try {
    link = await services.dispatch(prepared, preparedMilestone, request);
  } catch (error) {
    await store.update(record.id, (fresh) => ({
      ...fresh,
      milestones: fresh.milestones.map((item) =>
        item.id === milestone.id && item.pendingDispatch?.startedAt === now
          ? { ...item, pendingDispatch: undefined }
          : item,
      ),
    }));
    throw error;
  }
  const running: Milestone = {
    ...preparedMilestone,
    status: 'running',
    verification: null,
    pendingDispatch: undefined,
    dispatch: {
      kind: request.kind,
      id: link.id,
      workspaceId: link.workspaceId,
      dispatchedAt: now,
      chargedUsd: 0,
      destination: request.destination,
      baseCommit: link.baseCommit,
    },
  };
  const cause = `milestone ${milestone.id} dispatched as ${request.kind} ${link.id}${request.destination ? ` delivering to ${request.destination}` : ''}`;
  const written = await store.update(record.id, (fresh) => {
    const current = fresh.milestones.find((item) => item.id === milestone.id);
    if (current?.pendingDispatch?.startedAt !== now || current.dispatch) return null;
    const linked = fresh.milestones.map((m) =>
      m.id === milestone.id
        ? { ...m, status: running.status, verification: null, dispatch: running.dispatch, pendingDispatch: undefined }
        : m,
    );
    const settled = settle({ ...fresh, milestones: linked }, now);
    return { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause }] };
  });
  if (!written) throw new Error(`Dispatch ${link.id} started, but milestone ${milestone.id} could not save its link. The project needs reconciliation.`);
  return { record: written, milestone: running };
}
