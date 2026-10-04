/**
 * Control of the work a project started: pause, resume, retry and cancel.
 *
 * A target is named by the project's own id for it, a milestone or a research
 * entry, never by a raw Room or Workflow id. The link is read from the record,
 * so work this project did not start cannot be reached at all.
 *
 * Every answer reports the state the work is in after the call, read back from
 * the Room or Workflow. Recovery acts on the same operation: a paused Room is
 * resumed, never started again, and a completed one hands back its result.
 * More time or more money than was approved is never taken here. The caller is
 * told what approval is needed, and the user gives it.
 */

import { getOrchestratorRoomRegistry, requestOrchestratorAction, type OrchestratorRoomInspection } from '@sero-ai/common';

import { everyMilestoneClosed } from '../shared/activity';
import { advancePhase, mayWakeForWork } from '../shared/lifecycle';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { RecordStore } from './record-store';

export const CONTROL_OPERATIONS = ['pause', 'resume', 'retry', 'cancel'] as const;
export type ControlOperation = (typeof CONTROL_OPERATIONS)[number];

/** Who stopped the work, so only the same hand starts it again. */
export type HeldBy = 'project' | 'owner';

export interface ControlRequest {
  /** A milestone id or a research id of this project. */
  target: string;
  operation: ControlOperation;
  /** resume: a new TOTAL working-time limit for a Room that used its time. */
  maxMinutes?: number;
  /** retry: a new TOTAL cap for a Workflow that stopped at its cap. */
  maxCostUsd?: number;
  /** The owner may not approve more time or money; the user may. */
  by: 'owner' | 'user' | 'project';
}

/** An approval only the user can give, with what applying it would do. */
export type NeededApproval =
  | { kind: 'room-time'; target: string; label: string; usedMinutes: number; currentMinutes: number; maxMinutes: number }
  | { kind: 'workflow-budget'; milestoneId: string; label: string; currentUsd: number; maxCostUsd: number };

export interface ControlOutcome {
  ok: boolean;
  text: string;
  /** The state read back from the work after the call. */
  status?: string;
  needsApproval?: NeededApproval;
}

export interface LinkedWorkDeps {
  store: RecordStore;
  /** The clock, so a phase change this module makes carries a real time. */
  now(): string;
  /** Continues an interrupted milestone Workflow through the existing retry action. */
  retryWorkflow(projectId: string, milestoneId: string, maxCostUsd?: number): Promise<{ ok: boolean; text: string }>;
}

interface Linked {
  kind: 'room' | 'workflow';
  id: string;
  workspaceId: string;
  label: string;
  heldBy?: HeldBy;
  milestone?: Milestone;
  source: { kind: 'milestone' | 'research'; id: string };
}

const refuse = (text: string, status?: string): ControlOutcome => ({ ok: false, text, ...(status ? { status } : {}) });
const minutes = (ms: number): number => Math.round(ms / 60_000);

/** Finds the linked run for one of the project's own ids. A string is the refusal. */
function resolveLinked(record: ProjectRecord, target: string): Linked | { completed: string } | string {
  const milestone = record.milestones.find((item) => item.id === target);
  if (milestone) {
    const dispatch = milestone.dispatch;
    if (!dispatch) return `Milestone ${target} has no linked Room or Workflow.`;
    return { kind: dispatch.kind, id: dispatch.id, workspaceId: dispatch.workspaceId, label: milestone.title, heldBy: dispatch.heldBy, milestone, source: { kind: 'milestone', id: target } };
  }
  const pending = record.pendingResearch?.find((entry) => entry.id === target);
  if (pending && record.workspaceId) {
    const base = { workspaceId: record.workspaceId, label: pending.question, heldBy: pending.heldBy, source: { kind: 'research' as const, id: target } };
    if (pending.roomId) return { ...base, kind: 'room', id: pending.roomId };
    if (pending.workflowId) return { ...base, kind: 'workflow', id: pending.workflowId };
    return `Research ${target} has no Room or Workflow to control yet.`;
  }
  const finished = record.research.find((entry) => entry.id === target);
  if (finished) return { completed: finished.result };
  return `"${target}" is not a milestone or a research entry of this project. Only work this project started can be controlled.`;
}

/** Saves, or clears, who stopped the work on the entry the link came from. */
async function markHeld(store: RecordStore, projectId: string, linked: Linked, heldBy: HeldBy | undefined): Promise<void> {
  await store.update(projectId, (fresh) => linked.source.kind === 'milestone'
    ? { ...fresh, milestones: fresh.milestones.map((item) => item.id === linked.source.id && item.dispatch?.id === linked.id ? { ...item, dispatch: { ...item.dispatch, heldBy } } : item) }
    : { ...fresh, pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === linked.source.id ? { ...entry, heldBy } : entry) });
}

/**
 * A milestone whose Room was cancelled or failed is set aside: it is no longer
 * running, so it stops holding the project folder and the activity line stops
 * naming it. No decision parks it, so the owner may dispatch it again. When it
 * was the last open milestone, the project reaches release here as well: the
 * accept path may have run earlier, while this one was still working.
 */
async function setAside(deps: LinkedWorkDeps, record: ProjectRecord, linked: Linked): Promise<string> {
  if (linked.source.kind !== 'milestone') return '';
  const now = deps.now();
  await deps.store.update(record.id, (fresh) => {
    const aside = {
      ...fresh,
      milestones: fresh.milestones.map((item) => item.id === linked.source.id && item.dispatch?.id === linked.id && item.status === 'running'
        ? { ...item, status: 'parked' as const, parkedBy: null, parkedByDecisions: [], parkedFrom: 'approved' as const }
        : item),
    };
    if (!everyMilestoneClosed(aside)) return aside;
    const released = advancePhase(aside, 'release', now, 'every milestone accepted or set aside; release starts');
    return released.ok ? released.record : aside;
  });
  return ` Milestone ${linked.source.id} is set aside and no longer holds the project folder. Dispatch it again if the work is still needed.`;
}

const timeUsedUp = (room: OrchestratorRoomInspection): boolean =>
  room.maxWallClockMs !== undefined && room.activeMs !== undefined && room.activeMs >= room.maxWallClockMs;

async function controlRoom(deps: LinkedWorkDeps, record: ProjectRecord, linked: Linked, request: ControlRequest): Promise<ControlOutcome> {
  const handle = getOrchestratorRoomRegistry()?.get(linked.workspaceId)?.handle;
  if (!handle) return refuse('The workspace Room runtime is not running, so the Room could not be reached.');
  const room = await handle.inspect(linked.id);
  if (!room) return refuse(`Room ${linked.id} no longer exists.`);
  // A finished Room is never resumed or made again. Its result is the answer.
  if (room.status === 'completed') {
    if (linked.heldBy) await markHeld(deps.store, record.id, linked, undefined);
    return { ok: true, status: room.status, text: `Room ${linked.id} already completed, so nothing was changed.${room.result ? ` Its result: ${room.result}` : ''}` };
  }
  // A Room that already ended without a result cannot be cancelled twice. Its
  // milestone is released here, with no question to the user.
  if (request.operation === 'cancel' && (room.status === 'cancelled' || room.status === 'failed')) {
    return { ok: true, status: room.status, text: `Room ${linked.id} is already ${room.status}.${await setAside(deps, record, linked)}` };
  }
  // Already paused by another hand: it is left as it is, and not claimed.
  if (request.operation === 'pause' && (room.status === 'paused' || room.status === 'pausing')) return { ok: true, status: room.status, text: `Room ${linked.id} is already paused.` };
  if (request.operation === 'pause' || request.operation === 'cancel') {
    // Marked before the pause, so the watcher that sees the Room stop already
    // knows whose pause it is and does not report it as a fault.
    const claims = request.operation === 'pause' && request.by !== 'user';
    if (claims) await markHeld(deps.store, record.id, linked, request.by === 'owner' ? 'owner' : 'project');
    const result = request.operation === 'pause' ? await handle.pause(linked.id) : await handle.cancel(linked.id);
    if (!result.ok) {
      if (claims) await markHeld(deps.store, record.id, linked, undefined);
      return refuse(`Room ${linked.id} was not changed: ${result.error}`, result.status ?? undefined);
    }
    return { ok: true, status: result.status, text: request.operation === 'pause'
      ? `Room ${linked.id} is ${result.status}. No new turn starts; a turn in flight finishes.`
      : `Room ${linked.id} is ${result.status}.${await setAside(deps, record, linked)}` };
  }
  // A Room still finishing its turns cannot resume yet. It is resumed when it
  // settles: see `hasSettledHeldRoom`.
  if (room.status === 'pausing') {
    return request.by === 'project'
      ? { ok: true, status: room.status, text: `Room ${linked.id} is finishing its turns. It resumes when they end.` }
      : refuse(`Room ${linked.id} is finishing its turns and cannot resume yet. Resume it after it is paused.`, room.status);
  }
  if (room.status !== 'paused') return { ok: room.status === 'running', status: room.status, text: `Room ${linked.id} is ${room.status}, so there is nothing to resume.` };

  let total: number | undefined;
  if (timeUsedUp(room)) {
    const current = room.maxWallClockMs ?? 0;
    const used = room.activeMs ?? 0;
    if (request.maxMinutes === undefined || !Number.isFinite(request.maxMinutes) || request.maxMinutes * 60_000 <= current) {
      return refuse(`Room ${linked.id} used its ${minutes(current)} min working-time limit (${minutes(used)} min used). Its work is kept. To continue, name a larger total with maxMinutes.`, room.status);
    }
    if (request.by === 'owner') {
      return { ok: false, status: room.status, text: 'More working time needs the user.', needsApproval: { kind: 'room-time', target: request.target, label: linked.label, usedMinutes: minutes(used), currentMinutes: minutes(current), maxMinutes: request.maxMinutes } };
    }
    total = request.maxMinutes * 60_000;
  } else if (room.hold?.kind === 'limit-reached') {
    return refuse(`Room ${linked.id} stopped at a limit that more time does not lift: ${room.hold.detail} Its work is kept. Plan the rest as new work inside the free budget, or raise a decision.`, room.status);
  } else if (room.hold?.kind === 'awaiting-approval' || room.hold?.kind === 'awaiting-user') {
    return refuse(`Room ${linked.id} waits for the user: ${room.hold.detail} It continues when they answer.`, room.status);
  } else if (room.hold?.kind === 'user-paused' && request.by !== 'user' && linked.heldBy !== request.by) {
    // A pause by another hand stays: the user's own pause, or the project's.
    return refuse(linked.heldBy === 'project' ? `Room ${linked.id} is paused with the project. It resumes when the user resumes the project.` : `The user paused Room ${linked.id}. It resumes when they resume it.`, room.status);
  }
  const result = await handle.resume(linked.id, total === undefined ? undefined : { maxWallClockMs: total });
  if (!result.ok) return refuse(`Room ${linked.id} did not resume: ${result.error}`, result.status ?? undefined);
  if (linked.heldBy) await markHeld(deps.store, record.id, linked, undefined);
  return { ok: true, status: result.status, text: `Room ${linked.id} is ${result.status}. It is the same Room; nothing was started again.${total === undefined ? '' : ` Its working-time limit is now ${request.maxMinutes} min in total. Its spending limit did not change.`}` };
}

async function controlWorkflow(deps: LinkedWorkDeps, record: ProjectRecord, linked: Linked, request: ControlRequest): Promise<ControlOutcome> {
  const owner = { projectId: record.id };
  switch (request.operation) {
    case 'cancel':
      return refuse(`Workflow ${linked.id} cannot be cancelled from here. Pause it to stop new runs.`);
    case 'pause': {
      const result = await requestOrchestratorAction(linked.workspaceId, { kind: 'set_armed', loopId: linked.id, armed: false, owner });
      if (!result.ok) return refuse(`Workflow ${linked.id} was not paused: ${result.error ?? 'the Orchestrator refused the change'}`);
      const disarmed = result.changedTriggerIds ?? [];
      if (linked.milestone && disarmed.length > 0) {
        // The triggers this pause turned off, so resume turns on exactly those.
        await deps.store.update(record.id, (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => item.id === linked.source.id && item.dispatch ? { ...item, dispatch: { ...item.dispatch, disarmedTriggerIds: disarmed } } : item) }));
      }
      if (request.by !== 'user') await markHeld(deps.store, record.id, linked, request.by);
      return { ok: true, text: `Workflow ${linked.id} starts no new run. A run in flight finishes.` };
    }
    case 'resume': {
      const triggerIds = linked.milestone?.dispatch?.disarmedTriggerIds;
      const result = await requestOrchestratorAction(linked.workspaceId, { kind: 'set_armed', loopId: linked.id, armed: true, owner, ...(triggerIds?.length ? { triggerIds } : {}) });
      if (!result.ok) return refuse(`Workflow ${linked.id} was not resumed: ${result.error ?? 'the Orchestrator refused the change'}`);
      await deps.store.update(record.id, (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => {
        if (item.id !== linked.source.id || !item.dispatch) return item;
        const { disarmedTriggerIds: _restored, heldBy: _released, ...rest } = item.dispatch;
        return { ...item, dispatch: rest };
      }) }));
      return { ok: true, text: `Workflow ${linked.id} may start runs again.` };
    }
    case 'retry': {
      const dispatch = linked.milestone?.dispatch;
      if (!linked.milestone || !dispatch) return refuse('Only a milestone Workflow can be retried.');
      if (!dispatch.failure) return refuse(`Workflow ${linked.id} is not interrupted, so there is nothing to retry.`);
      if (dispatch.costLimitUsd !== undefined && request.by === 'owner') {
        if (request.maxCostUsd === undefined || !(request.maxCostUsd > dispatch.costLimitUsd)) {
          return refuse(`Workflow ${linked.id} stopped at its $${dispatch.costLimitUsd} cap. Its work is kept. To continue, name a larger total with maxCostUsd.`);
        }
        return { ok: false, text: 'A larger Workflow cap needs the user.', needsApproval: { kind: 'workflow-budget', milestoneId: linked.milestone.id, label: linked.label, currentUsd: dispatch.costLimitUsd, maxCostUsd: request.maxCostUsd } };
      }
      const retried = await deps.retryWorkflow(record.id, linked.milestone.id, request.maxCostUsd);
      return { ok: retried.ok, text: retried.text };
    }
  }
}

export async function controlLinkedWork(deps: LinkedWorkDeps, record: ProjectRecord, request: ControlRequest): Promise<ControlOutcome> {
  const linked = resolveLinked(record, request.target.trim());
  if (typeof linked === 'string') return refuse(linked);
  if ('completed' in linked) return { ok: true, status: 'completed', text: `Research ${request.target} already completed, so nothing was resumed or started again. Its result is on the record: ${linked.completed}` };
  // The owner starts nothing while the project is stopped. The user may.
  if (request.by === 'owner' && (request.operation === 'resume' || request.operation === 'retry') && !mayWakeForWork(record)) {
    return refuse(`The project is ${record.overlay}; no work may be started again until the user lifts it.`);
  }
  return linked.kind === 'room' ? controlRoom(deps, record, linked, request) : controlWorkflow(deps, record, linked, request);
}

/** The ids of the project's own entries that have a Room which may still take turns. */
function roomTargets(record: ProjectRecord): string[] {
  return [
    ...record.milestones.filter((item) => item.dispatch?.kind === 'room' && item.status === 'running').map((item) => item.id),
    ...(record.pendingResearch ?? []).filter((entry) => entry.roomId).map((entry) => entry.id),
  ];
}

const heldByProject = (record: ProjectRecord): string[] => [
  ...record.milestones.filter((item) => item.dispatch?.heldBy === 'project').map((item) => item.id),
  ...(record.pendingResearch ?? []).filter((entry) => entry.heldBy === 'project').map((entry) => entry.id),
];

/**
 * A project pause or stop under a delivery agreement also stops its Rooms
 * taking new turns. A turn in flight finishes and reports; nothing is
 * cancelled. A Room someone else already paused is left as it is, so resume
 * does not start what the user stopped by hand.
 */
export async function holdProjectWork(deps: LinkedWorkDeps, record: ProjectRecord): Promise<{ note: string }> {
  let held = 0;
  const failed: string[] = [];
  for (const target of roomTargets(record)) {
    const fresh = (await deps.store.read(record.id)) ?? record;
    const outcome = await controlLinkedWork(deps, fresh, { target, operation: 'pause', by: 'project' });
    if (!outcome.ok) failed.push(outcome.text);
    else if (outcome.status === 'paused' || outcome.status === 'pausing') held += 1;
  }
  return { note: `${held > 0 ? ` ${held} Room${held === 1 ? '' : 's'} take${held === 1 ? 's' : ''} no new turn; turns in flight finish.` : ''}${failed.length > 0 ? ` Not paused: ${failed.join(' ')}` : ''}` };
}

/**
 * Resumes exactly the Rooms the project pause stopped. Each is inspected
 * first, so one that finished while the project was paused hands over its
 * result and is not opened again.
 */
export async function releaseProjectWork(deps: LinkedWorkDeps, record: ProjectRecord): Promise<{ note: string }> {
  const notes: string[] = [];
  for (const target of heldByProject(record)) {
    const fresh = (await deps.store.read(record.id)) ?? record;
    const outcome = await controlLinkedWork(deps, fresh, { target, operation: 'resume', by: 'project' });
    if (outcome.ok) continue;
    // A Room that cannot resume is handed back unclaimed, so its stop is
    // reported like any other and the release is not tried again for ever.
    notes.push(outcome.text);
    await deps.store.update(record.id, (current) => ({
      ...current,
      milestones: current.milestones.map((item) => item.id === target && item.dispatch?.heldBy ? { ...item, dispatch: { ...item.dispatch, heldBy: undefined } } : item),
      pendingResearch: current.pendingResearch?.map((entry) => entry.id === target ? { ...entry, heldBy: undefined } : entry),
    }));
  }
  return { note: notes.length > 0 ? ` ${notes.join(' ')}` : '' };
}

/**
 * True when a Room the project pause stopped has finished its turns and sits
 * paused, although the project runs again. The resume could not reach it while
 * it was still finishing, so the watcher that sees it settle asks for the
 * release then. Driven by the Room index change; nothing polls for it.
 */
export function hasSettledHeldRoom(record: ProjectRecord, rooms: readonly { id: string; status: string }[]): boolean {
  if (record.paused || record.blockedReason !== null) return false;
  const held = new Set([
    ...record.milestones.filter((item) => item.dispatch?.heldBy === 'project').map((item) => item.dispatch?.id),
    ...(record.pendingResearch ?? []).filter((entry) => entry.heldBy === 'project').map((entry) => entry.roomId),
  ]);
  return rooms.some((room) => room.status === 'paused' && held.has(room.id));
}
