/**
 * Performs one dispatch and links it to its milestone. Shared by the owner's
 * dispatch action and by the answer to a forced-escalation decision, so both
 * paths write the same record shape.
 */

import { randomUUID } from 'node:crypto';

import { block, mayDispatch, settle, unblock } from '../shared/lifecycle';
import { MAINTENANCE_MILESTONE_ID } from '../shared/maintenance';
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
  background = false,
): Promise<{ record: ProjectRecord; milestone: Milestone }> {
  const scopedRequest = { ...request, prompt: [
    'APPROVED ARCHITECT SCOPE. This brief and milestone govern the task. Earlier research artifacts are recommendations, not approvals; do not replace these requirements with them.',
    `Project brief: ${record.brief ?? record.idea}`,
    `Milestone: ${milestone.title}\n${milestone.plan ?? ''}`,
    `Task from the owner:\n${request.prompt}`,
  ].join('\n\n') };
  const intent = { kind: request.kind, destination: request.destination, startedAt: now,
    ...(request.kind === 'workflow' ? { request: { id: randomUUID(), prompt: scopedRequest.prompt, maxCostUsd: request.maxCostUsd } } : {}),
  };
  const prepared = await store.update(record.id, (fresh) => {
    const current = fresh.milestones.find((item) => item.id === milestone.id);
    if (!current || current.dispatch || current.pendingDispatch) return null;
    if (request.kind === 'workflow' && (!request.destination || request.destination === 'workspace-files')
      && (fresh.pendingEvidence?.length || fresh.milestones.some((item) => item.id !== milestone.id && item.id !== MAINTENANCE_MILESTONE_ID
        && (item.pendingDispatch || (item.status === 'running' && item.dispatch?.kind === 'workflow'
          && (!item.dispatch.destination || item.dispatch.destination === 'workspace-files')))))) return null;
    const milestones = fresh.milestones.map((item) =>
      item.id === milestone.id ? { ...item, pendingDispatch: intent } : item,
    );
    return settle({ ...fresh, milestones, stateLine: `Preparing ${milestone.title}.` }, now);
  });
  if (!prepared) throw new Error(`Milestone ${milestone.id} could not reserve its dispatch.`);
  const preparedMilestone = prepared.milestones.find((item) => item.id === milestone.id);
  if (!preparedMilestone) throw new Error(`Milestone ${milestone.id} is no longer on this project.`);

  const completion = finishDispatch(store, services, prepared, preparedMilestone, scopedRequest, now);
  if (!background) return completion;
  void completion.catch(async (error: unknown) => {
    const reason = `Could not start ${milestone.title}: ${error instanceof Error ? error.message : String(error)}`;
    await store.update(record.id, (fresh) => {
      const stopped = block(fresh, new Date().toISOString(), reason);
      return stopped.ok ? { ...stopped.record, stateLine: reason } : null;
    });
  }).catch((error: unknown) => console.error(`Could not record dispatch failure for ${record.id}`, error));
  return { record: prepared, milestone: preparedMilestone };
}

const active = new WeakMap<RecordStore, Map<string, Promise<{ record: ProjectRecord; milestone: Milestone }>>>();

export async function recoverDispatch(store: RecordStore, services: OwnerServices, record: ProjectRecord): Promise<boolean> {
  const milestone = record.milestones.find((item) => item.pendingDispatch?.request);
  const pending = milestone?.pendingDispatch;
  if (!milestone || !pending?.request || pending.kind !== 'workflow') return false;
  const recoverableBlock = record.blockedReason?.startsWith('Could not start ')
    || record.blockedReason?.startsWith('dispatch state could not be confirmed after restart:');
  const eligible = recoverableBlock ? { ...record, blockedReason: null } : record;
  if (!mayDispatch(eligible) || milestone.status === 'parked') return false;
  await finishDispatch(store, services, eligible, milestone, {
    kind: 'workflow', destination: pending.destination,
    prompt: pending.request.prompt, maxCostUsd: pending.request.maxCostUsd,
  }, pending.startedAt);
  return true;
}

function finishDispatch(
  store: RecordStore, services: OwnerServices, prepared: ProjectRecord,
  milestone: Milestone, request: DispatchRequest, now: string,
): Promise<{ record: ProjectRecord; milestone: Milestone }> {
  let operations = active.get(store);
  if (!operations) { operations = new Map(); active.set(store, operations); }
  const key = `${prepared.id}:${milestone.id}`;
  const existing = operations.get(key);
  if (existing) return existing;
  const operation = linkDispatch(store, services, prepared, milestone, request, now)
    .finally(() => operations.delete(key));
  operations.set(key, operation);
  return operation;
}

async function linkDispatch(
  store: RecordStore, services: OwnerServices, prepared: ProjectRecord,
  preparedMilestone: Milestone, request: DispatchRequest, now: string,
): Promise<{ record: ProjectRecord; milestone: Milestone }> {
  const record = prepared;
  const milestone = preparedMilestone;

  // The dispatch itself is slow and must stay outside the store's write queue;
  // the durable intent prevents a crash or write failure from creating a duplicate run.
  let link: Awaited<ReturnType<OwnerServices['dispatch']>>;
  try {
    link = await services.dispatch(prepared, preparedMilestone, request);
  } catch (error) {
    await store.update(record.id, (fresh) => ({
      ...fresh,
      milestones: fresh.milestones.map((item) =>
        item.id === milestone.id && item.pendingDispatch?.startedAt === now && !item.pendingDispatch.request
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
    const recovered = fresh.blockedReason?.startsWith('Could not start ') || fresh.blockedReason?.startsWith('dispatch state could not be confirmed after restart:')
      ? unblock(fresh, now, `recovered dispatch for ${milestone.id}`) : null;
    const settled = settle({ ...(recovered?.ok ? recovered.record : fresh), milestones: linked, stateLine: `Working on ${milestone.title}.` }, now);
    return { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause }] };
  });
  if (!written) throw new Error(`Dispatch ${link.id} started, but milestone ${milestone.id} could not save its link. The project needs reconciliation.`);
  // Activation waits for execution. Save the link first, then let the existing
  // dispatch watcher report progress without holding the owner's tool call.
  if (link.start) void link.start().catch(async (error: unknown) => {
    const reason = `Milestone ${milestone.id} failed: ${error instanceof Error ? error.message : String(error)}`;
    await store.update(record.id, (fresh) => {
      if (fresh.milestones.find((item) => item.id === milestone.id)?.dispatch?.id !== link.id) return null;
      const stopped = block(fresh, new Date().toISOString(), reason);
      return stopped.ok ? { ...stopped.record, stateLine: reason } : null;
    });
  }).catch((error: unknown) => console.error(`Could not record failure for dispatch ${link.id}`, error));
  return { record: written, milestone: running };
}
