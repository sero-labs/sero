import path from 'node:path';
import { roomWorkspace } from './execution-location';
import { setTimeout as delay } from 'node:timers/promises';
import { createOrchestratorRoom, getOrchestratorRoomRegistry, ORCHESTRATOR_ROOM_INDEX_FILE, type OrchestratorBoardRoomView } from '@sero-ai/common';
import { block, charge, settle, unblock } from '../shared/lifecycle';
import type { PendingResearch, ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import { roomModelLimits } from './model-selection';

interface ResearchRoomDeps {
  host: Pick<ArchitectHost, 'modelTiers' | 'readJson' | 'now' | 'log'>;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
}

const active = new WeakMap<RecordStore, Set<string>>();

/** The research intent is saved before planning. Recovery reuses its Room request. */
export async function startResearchRoom(deps: ResearchRoomDeps, record: ProjectRecord, pending: PendingResearch): Promise<void> {
  let running = active.get(deps.store);
  if (!running) { running = new Set(); active.set(deps.store, running); }
  if (running.has(pending.id)) return;
  running.add(pending.id);
  try {
    if (!record.workspaceId) throw new Error('The project has no workspace for research.');
    const deadline = Date.now() + 5000;
    while (!getOrchestratorRoomRegistry()?.has(record.workspaceId) && Date.now() < deadline) await delay(100);
    if (!getOrchestratorRoomRegistry()?.has(record.workspaceId)) throw new Error('The workspace Room runtime is not ready. Resume to retry.');
    if (!pending.roomId) {
      if (record.paused || record.blockedReason) return;
      if ((pending.attempts ?? 0) >= 2) throw new Error('Research Room planning was interrupted twice. Its saved request needs review.');
      const remaining = record.budget.capUsd === null ? 5 : record.budget.capUsd - record.budget.spentUsd;
      if (remaining <= 0) throw new Error('There is no project budget left for research.');
      await deps.store.update(record.id, (fresh) => ({ ...fresh, pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, attempts: (entry.attempts ?? 0) + 1 } : entry) }));
      const result = await createOrchestratorRoom(record.workspaceId, {
        requestId: `${record.id}:${pending.id}`,
        mandate: `Collaborate on the requested project task.\nUser idea: ${record.idea}\nQuestion: ${pending.question}\nStop when: ${pending.stoppingCondition}\nWork together to investigate the question, challenge assumptions and produce concrete findings with evidence and unresolved user decisions. Do not implement the product.`,
        limits: { ...await roomModelLimits(deps.host), ...roomWorkspace(record), maxCostUsd: Math.min(5, remaining), maxWallClockMs: 15 * 60_000, maxMembers: 3, access: 'read-only', deliveryDestination: 'workspace-files' },
      });
      if (!result.ok) throw new Error(result.error);
      await deps.store.update(record.id, (fresh) => settle({ ...fresh,
        pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, roomId: result.roomId, chargedUsd: 0 } : entry),
        stateLine: 'A Room is working on the project question.',
      }, deps.host.now()));
    }
    // Covers a Room that finished before its link was saved, and restart reads.
    const index = await deps.host.readJson(path.join(record.folder, ORCHESTRATOR_ROOM_INDEX_FILE));
    const rooms = (index as { rooms?: OrchestratorBoardRoomView[] } | null)?.rooms;
    if (Array.isArray(rooms)) await observeResearchRooms(deps, record.id, rooms);
  } catch (error) {
    const reason = `Research Room could not continue: ${error instanceof Error ? error.message : String(error)}`;
    await deps.store.update(record.id, (fresh) => {
      const held = block(fresh, deps.host.now(), reason);
      return held.ok ? { ...held.record, stateLine: reason } : fresh;
    });
  } finally { running.delete(pending.id); }
}

/** Room completion supplies findings, not product acceptance. Costs remain cumulative. */
export async function observeResearchRooms(deps: ResearchRoomDeps, projectId: string, rooms: OrchestratorBoardRoomView[]): Promise<void> {
  const record = await deps.store.read(projectId);
  if (!record?.workspaceId) return;
  for (const pending of record.pendingResearch ?? []) {
    const room = rooms.find((entry) => entry.id === pending.roomId);
    if (pending.kind !== 'room' || !room) continue;
    const inspection = await getOrchestratorRoomRegistry()?.get(record.workspaceId)?.handle.inspect(room.id);
    let completed = false;
    await deps.store.update(projectId, (fresh) => {
      const current = fresh.pendingResearch?.find((entry) => entry.id === pending.id);
      if (!current) return null;
      const delta = Math.max(0, room.costUsd - (current.chargedUsd ?? 0));
      let next = charge(fresh, 'research', delta, deps.host.now());
      if (next.blockedReason?.startsWith(`Research Room ${room.id} is `) && ['ready', 'running', 'completed'].includes(room.status)) {
        const resumed = unblock(next, deps.host.now(), `Research Room ${room.id} resumed`);
        if (resumed.ok) next = { ...resumed.record, stateLine: 'The research Room is working.' };
      }
      if (room.status === 'completed' && inspection?.result?.trim()) {
        completed = true;
        return settle({ ...next, stateLine: 'Room findings are ready for the Architect.',
          pendingResearch: next.pendingResearch?.filter((entry) => entry.id !== pending.id),
          research: [...next.research, { id: pending.id, roomId: room.id, models: inspection.models, question: pending.question, stoppingCondition: pending.stoppingCondition, result: inspection.result, costUsd: room.costUsd, completedAt: deps.host.now() }],
        }, deps.host.now());
      }
      next = { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, chargedUsd: room.costUsd, models: inspection?.models ?? entry.models } : entry) };
      if (['failed', 'cancelled', 'paused'].includes(room.status) || (room.status === 'completed' && inspection && !inspection.result?.trim())) {
        const reason = room.status === 'completed' ? `Research Room ${room.id} finished without saved findings. Open the Room to review its result.` : `Research Room ${room.id} is ${room.status}. Open the Room to review its next action.`;
        const held = block(next, deps.host.now(), reason);
        if (held.ok) next = { ...held.record, stateLine: reason };
      }
      return next;
    });
    if (completed) deps.wake(projectId, { kind: 'quiet', at: deps.host.now(), items: [`Research Room ${room.id} finished. Read research ${pending.id} and use its findings for the next project action.`] });
  }
}
