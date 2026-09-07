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
  const link = await services.dispatch(record, milestone, request);
  const running: Milestone = {
    ...milestone,
    status: 'running',
    verification: null,
    dispatch: { kind: request.kind, id: link.id, workspaceId: link.workspaceId, dispatchedAt: now, chargedUsd: 0, destination: request.destination },
  };
  const settled = settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? running : m)) }, now);
  const next: ProjectRecord = {
    ...settled,
    history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause: `milestone ${milestone.id} dispatched as ${request.kind} ${link.id}${request.destination ? ` delivering to ${request.destination}` : ''}` }],
  };
  await store.write(next);
  return { record: next, milestone: running };
}
