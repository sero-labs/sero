import { closeDeliveredObjectives } from './objective-completion';
import type { RunJournal } from './run-journal';
import { ensureResearchContext } from './research-context';
import { setAccountingIncomplete } from '../shared/accounting';
import { recordCharge, chargeRoomPlanning } from './project-usage';
import path from 'node:path';
import { roomWorkspace } from './execution-location';
import { setTimeout as delay } from 'node:timers/promises';
import { createOrchestratorRoom, getOrchestratorRoomRegistry, ORCHESTRATOR_ROOM_INDEX_FILE, type OrchestratorBoardRoomView } from '@sero-ai/common';
import { block, charge, settle, unblock } from '../shared/lifecycle';
import type { PendingResearch, ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import { attachResearchArtifact } from './research-artifact';
import { roomModelLimits } from './model-selection';
import { hasOpenResearchAccessDecision, raiseResearchAccessDecision, researchBlockCause } from './research-access';

interface ResearchRoomDeps {
  host: Pick<ArchitectHost, 'listModels' | 'modelTiers' | 'readJson' | 'now' | 'log' | 'newId'>;
  store: RecordStore;
  journal?: RunJournal;
  wake(projectId: string, wake: WakeEvent): void;
}

/** One start per research entry at a time. A start requested meanwhile runs after it, never instead of nothing. */
const active = new WeakMap<RecordStore, Map<string, { again: boolean }>>();

/** The research intent is saved before planning. Recovery reuses its Room request. */
export async function startResearchRoom(deps: ResearchRoomDeps, snapshot: ProjectRecord, requested: PendingResearch): Promise<void> {
  let running = active.get(deps.store);
  if (!running) { running = new Map(); active.set(deps.store, running); }
  const inFlight = running.get(requested.id);
  if (inFlight) { inFlight.again = true; return; }
  const slot = { again: false };
  running.set(requested.id, slot);
  try {
    if (!snapshot.workspaceId) throw new Error('The project has no workspace for research.');
    const deadline = Date.now() + 5000;
    while (!getOrchestratorRoomRegistry()?.has(snapshot.workspaceId) && Date.now() < deadline) await delay(100);
    if (!getOrchestratorRoomRegistry()?.has(snapshot.workspaceId)) throw new Error('The workspace Room runtime is not ready. Resume to retry.');
    // The wait above is long enough for an answer to land, so the decisions
    // below are taken on the record as it is now, not on the caller's copy.
    const record = (await deps.store.read(snapshot.id)) ?? snapshot;
    const pending = record.pendingResearch?.find((entry) => entry.id === requested.id);
    if (!pending) return;
    if (!pending.roomId) {
      if (record.paused || record.blockedReason) return;
      // The planner already asked; the user has not answered. Planning again
      // would only ask again.
      if (hasOpenResearchAccessDecision(record, pending.id)) return;
      if ((pending.attempts ?? 0) >= 2) throw new Error('Research Room planning was interrupted twice. Its saved request needs review.');
      const project = await ensureResearchContext(deps, record, pending);
      const remaining = record.budget.capUsd === null ? 5 : record.budget.capUsd - record.budget.spentUsd;
      if (remaining <= 0) throw new Error('There is no project budget left for research.');
      await deps.store.update(record.id, (fresh) => ({ ...fresh, pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, attempts: (entry.attempts ?? 0) + 1 } : entry) }));
      await chargeRoomPlanning(deps, record.id, { kind: 'research', id: pending.id });
      // The access level follows the question. Reading needs one shared checkout
      // and no shell; a question that must run tests or builds needs a worktree
      // per member and commands, which is edit-workspace and nothing wider.
      const access = pending.access ?? 'read-only';
      const commands = access === 'edit-workspace'
        ? ' You may run commands such as tests and builds to answer the question.'
        : '';
      const result = await createOrchestratorRoom(snapshot.workspaceId, {
        project, requestId: `${record.id}:${pending.id}`,
        mandate: `Collaborate on the requested project task.\nUser idea: ${record.idea}\nQuestion: ${pending.question}\nStop when: ${pending.stoppingCondition}\nWork together to investigate the question, challenge assumptions and produce concrete findings with evidence and unresolved user decisions.${commands} Do not implement the product.`,
        // Commands need isolation whatever the project's own mode: in Workspace
        // mode an editing member would otherwise run in the shared working tree.
        limits: { ...await roomModelLimits(deps.host, project.modelSnapshot), ...roomWorkspace(record), ...(access === 'edit-workspace' ? { executionMode: 'worktree' as const } : {}), maxCostUsd: Math.min(5, remaining), maxWallClockMs: 15 * 60_000, maxMembers: 3, access, deliveryDestination: 'workspace-files' },
      });
      await chargeRoomPlanning(deps, record.id, { kind: 'research', id: pending.id }, result.usage);
      if (!result.ok && result.questions?.length) {
        // A planner question is the user's to answer, on the project page,
        // not a failure that blocks the project with nothing to click.
        await raiseResearchAccessDecision(deps, record.id, pending, result.questions);
        return;
      }
      if (!result.ok) throw new Error(result.error);
      await deps.store.update(record.id, (fresh) => settle({ ...fresh,
        pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, roomId: result.roomId, chargedUsd: entry.chargedUsd ?? 0 } : entry),
        stateLine: 'A Room is working on the project question.',
      }, deps.host.now()));
    }
    // Covers a Room that finished before its link was saved, and restart reads.
    const index = await deps.host.readJson(path.join(record.folder, ORCHESTRATOR_ROOM_INDEX_FILE));
    const rooms = (index as { rooms?: OrchestratorBoardRoomView[] } | null)?.rooms;
    if (Array.isArray(rooms)) await observeResearchRooms(deps, record.id, rooms);
  } catch (error) {
    const reason = `Research Room could not continue: ${error instanceof Error ? error.message : String(error)}`;
    await deps.store.update(snapshot.id, (fresh) => {
      const held = block(fresh, deps.host.now(), reason);
      return held.ok ? { ...held.record, stateLine: reason } : fresh;
    });
  } finally {
    running.delete(requested.id);
    if (slot.again) {
      const latest = await deps.store.read(snapshot.id);
      const entry = latest?.pendingResearch?.find((item) => item.id === requested.id);
      if (latest && entry) await startResearchRoom(deps, latest, entry);
    }
  }
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
    let chargedDelta = 0;
    await deps.store.update(projectId, (fresh) => {
      const current = fresh.pendingResearch?.find((entry) => entry.id === pending.id);
      if (!current) return null;
      const delta = Math.max(0, room.costUsd - (current.chargedUsd ?? 0));
      chargedDelta = delta;
      let next = charge(setAccountingIncomplete(fresh, `room:${room.id}`, room.usageIncomplete !== false), 'research', delta, deps.host.now());
      if (next.blockedReason?.startsWith(`Research Room ${room.id} is `) && ['ready', 'running', 'completed'].includes(room.status)) {
        const resumed = unblock(next, deps.host.now(), `Research Room ${room.id} resumed`);
        if (resumed.ok) next = { ...resumed.record, stateLine: 'The research Room is working.' };
      }
      if (room.status === 'completed' && inspection?.result?.trim()) {
        completed = true;
        return closeDeliveredObjectives(settle({ ...next, stateLine: 'Room findings are ready for the Architect.',
          pendingResearch: next.pendingResearch?.filter((entry) => entry.id !== pending.id),
          research: [...next.research, { id: pending.id, roomId: room.id, models: inspection.models, question: pending.question, stoppingCondition: pending.stoppingCondition, result: inspection.result, costUsd: Math.max(room.costUsd, current.chargedUsd ?? 0), completedAt: deps.host.now() }],
        }, deps.host.now()), deps.host.now());
      }
      next = { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, chargedUsd: Math.max(room.costUsd, current.chargedUsd ?? 0), models: inspection?.models ?? entry.models } : entry) };
      if (['failed', 'cancelled', 'paused'].includes(room.status) || (room.status === 'completed' && inspection && !inspection.result?.trim())) {
        const reason = room.status === 'completed' ? `Research Room ${room.id} finished without saved findings. Open the Room to review its result.` : `Research Room ${room.id} is ${room.status}. Open the Room to review its next action.`;
        // The Room's title and the cause are both in hand here. Saving them is
        // what lets the project page name the Room and say what happened,
        // instead of showing its id and leaving the reason in History.
        const cause = researchBlockCause(next, current);
        const held = block(next, deps.host.now(), reason, {
          kind: 'room',
          id: room.id,
          title: room.title,
          status: room.status === 'completed' ? 'finished without findings' : room.status,
          at: deps.host.now(),
          ...(cause ? { cause } : {}),
        });
        if (held.ok) next = { ...held.record, stateLine: reason };
      }
      return next;
    });
    await recordCharge(deps, record, `room:${room.id}`, chargedDelta, 'aggregate', pending.project?.runId);
    if (completed) {
      // The finding is already recorded, so saving the report only adds the
      // reference a later contract points at.
      await attachResearchArtifact(deps.store, projectId, pending.id);
      deps.wake(projectId, { kind: 'quiet', at: deps.host.now(), items: [`Research Room ${room.id} finished. Read research ${pending.id} and use its findings for the next project action.`] });
    }
  }
}
