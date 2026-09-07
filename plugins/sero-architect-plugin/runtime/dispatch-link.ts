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
  // The dispatch itself is slow and must stay outside the store's write queue;
  // only the link is written under it, on whatever the record says by then.
  const link = await services.dispatch(record, milestone, request);
  const running: Milestone = {
    ...milestone,
    status: 'running',
    verification: null,
    dispatch: { kind: request.kind, id: link.id, workspaceId: link.workspaceId, dispatchedAt: now, chargedUsd: 0, destination: request.destination },
  };
  const cause = `milestone ${milestone.id} dispatched as ${request.kind} ${link.id}${request.destination ? ` delivering to ${request.destination}` : ''}`;
  const written = await store.update(record.id, (fresh) => {
    const linked = fresh.milestones.map((m) =>
      m.id === milestone.id ? { ...m, status: running.status, verification: null, dispatch: running.dispatch } : m,
    );
    const settled = settle({ ...fresh, milestones: linked }, now);
    return { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause }] };
  });
  return { record: written ?? record, milestone: running };
}
