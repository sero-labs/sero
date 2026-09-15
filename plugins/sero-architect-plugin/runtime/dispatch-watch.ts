import { setAccountingIncomplete } from '../shared/accounting';
/**
 * Follows the Orchestrator loop and Room index files of each project's
 * workspace and turns status transitions into wakes and usage into charges.
 * Push only: the host delivers each index write; nothing here polls.
 *
 * Completion is a claim: a completed Workflow or Room moves its milestone to
 * `verifying` with verification `reported`, never to `done`.
 */

import path from 'node:path';

import type { OrchestratorBoardLoopView, OrchestratorBoardRoomView } from '@sero-ai/common';

import { block, charge, settle } from '../shared/lifecycle';
import { ORCHESTRATOR_INDEX_FILE, ORCHESTRATOR_ROOM_INDEX_FILE } from '@sero-ai/common';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { WakeEvent, WakeKind } from '../shared/wake';
import { applyDelivery, isAccepted } from './delivery';
import type { ArchitectHost } from './host';
import { recordCharge } from './project-usage';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';
import { applyRunHealth } from './run-health';
import { observeResearchRooms } from './research-room';
import { observeResearchWorkflows } from './research-workflow';

/** The Orchestrator's own state directory, derived from the contract's index path so a move there moves here. */
export const ORCHESTRATOR_STATE_DIR = path.dirname(ORCHESTRATOR_INDEX_FILE);

export function orchestratorIndexFiles(workspacePath: string): { loops: string; rooms: string } {
  return {
    loops: path.join(workspacePath, ORCHESTRATOR_INDEX_FILE),
    rooms: path.join(workspacePath, ORCHESTRATOR_ROOM_INDEX_FILE),
  };
}

/** The per-loop run index, where delivery receipts appear. */
export function loopRunsIndexFile(workspacePath: string, loopId: string): string {
  return path.join(workspacePath, ORCHESTRATOR_STATE_DIR, 'loops', loopId, 'runs', 'index.json');
}

interface RunView {
  id: string;
  status: string;
  startedAt?: string;
  delivery?: { destination: string; ref: string; summary: string; deliveredAt: string };
}

function runsOf(state: unknown): RunView[] {
  const runs = (state as { runs?: unknown } | null)?.runs;
  return Array.isArray(runs) ? (runs as RunView[]) : [];
}

interface Seen {
  status: string;
  pending: number;
  lastRunAt: string | null;
}

export interface DispatchWatchDeps {
  host: Pick<ArchitectHost, 'onStateChange' | 'readJson' | 'now' | 'log' | 'listWorkspaces' | 'modelTiers'>;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
  /**
   * Opens the run for a maintenance objective, before its first model call.
   * Absent in tests and in hosts without the run journal.
   */
  openMaintenanceRun?(projectId: string, objectiveId: string): Promise<void>;
  /**
   * The run journal. A delegated Workflow or Room reports one cumulative total,
   * so this is where the largest charge in a project enters the trace.
   */
  journal?: RunJournal;
}

export interface DispatchWatch {
  /** Starts following the project's workspace indexes; reads them once for missed transitions. */
  track(record: ProjectRecord): Promise<void>;
  untrack(projectId: string): void;
  /** Resolves once every queued index change has been applied. */
  flush(): Promise<void>;
  dispose(): void;
}

type LoopView = OrchestratorBoardLoopView & { lastRunAt?: string; usage?: { costUsd?: number } };
type RoomView = OrchestratorBoardRoomView;

function loopsOf(state: unknown): LoopView[] {
  const loops = (state as { loops?: unknown } | null)?.loops;
  return Array.isArray(loops) ? (loops as LoopView[]) : [];
}

function roomsOf(state: unknown): RoomView[] {
  const rooms = (state as { rooms?: unknown } | null)?.rooms;
  return Array.isArray(rooms) ? (rooms as RoomView[]) : [];
}

interface Transition {
  kind: WakeKind;
  item: string;
  /** The milestone moves to verifying with a reported claim. */
  reported: boolean;
  /**
   * The objective identity behind an `external-event` wake: the maintenance
   * run's own start time. A repeat of the same run reuses it, so one objective
   * never opens a second Architect run.
   */
  objectiveId?: string;
}

function loopTransition(milestone: Milestone, loop: LoopView, seen: Seen | undefined): Transition | null {
  const pending = loop.pendingInput ?? 0;
  const scheduled = (loop.schedules?.length ?? 0) > 0;
  const label = `milestone ${milestone.id} (Workflow ${loop.id} "${loop.title}")`;
  // A loop that keeps running on events or a schedule reports each run through
  // `lastRunAt`; the maintenance Workflow is one, and its completion never
  // moves its milestone.
  if ((scheduled || milestone.id === 'maintenance') && seen && loop.lastRunAt && loop.lastRunAt !== seen.lastRunAt) {
    return { kind: 'external-event', item: `${label} ran on an event at ${loop.lastRunAt}`, reported: false, objectiveId: `${loop.id}:${loop.lastRunAt}` };
  }
  if (milestone.id === 'maintenance') return null;
  if (loop.status === 'complete' && seen?.status !== 'complete' && milestone.status !== 'done') {
    return { kind: 'dispatch-complete', item: `${label} reported completion; it is a claim until evidence passes`, reported: true };
  }
  if (loop.status === 'blocked' && seen?.status !== 'blocked') {
    return { kind: 'dispatch-blocked', item: `${label} is blocked${loop.block?.reason ? `: ${loop.block.reason}` : ''}`, reported: false };
  }
  if (pending > 0 && (seen?.pending ?? 0) === 0) {
    return { kind: 'dispatch-blocked', item: `${label} asked a question`, reported: false };
  }
  return null;
}

function roomTransition(milestone: Milestone, room: RoomView, seen: Seen | undefined): Transition | null {
  const label = `milestone ${milestone.id} (Room ${room.id} "${room.title}")`;
  if (room.status === 'completed' && seen?.status !== 'completed' && milestone.status !== 'done') {
    return { kind: 'dispatch-complete', item: `${label} reported completion; it is a claim until evidence passes`, reported: true };
  }
  if ((room.status === 'failed' || room.status === 'cancelled' || room.status === 'paused') && seen?.status !== room.status) {
    return { kind: 'dispatch-blocked', item: `${label} is ${room.status}`, reported: false };
  }
  if (room.attentionCount > 0 && (seen?.pending ?? 0) === 0) {
    return { kind: 'dispatch-blocked', item: `${label} needs attention`, reported: false };
  }
  return null;
}

export function createDispatchWatch(deps: DispatchWatchDeps): DispatchWatch {
  const { host, store } = deps;
  const subscriptions = new Map<string, Array<() => void>>();
  const seen = new Map<string, Seen>();
  let queue: Promise<void> = Promise.resolve();

  const runSubscriptions = new Map<string, () => void>();

  /**
   * A receipt proves the artifact exists at the destination and nothing more:
   * an accepted milestone becomes delivered, any other keeps its state and
   * shows the receipt as delivery evidence only. When acceptance comes later,
   * owner-actions runs the same delivery step.
   */
  const applyRuns = async (projectId: string, loopId: string, runs: RunView[]): Promise<void> => {
    const now = host.now();
    await applyRunHealth(store, projectId, loopId, runs, now);
    const items: string[] = [];
    await store.update(projectId, (record) => {
      const milestone = record.milestones.find((m) => m.dispatch?.kind === 'workflow' && m.dispatch.id === loopId);
      const latestRuns = runs.toSorted((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
      // Workspace-file dispatches run in this project's root. Orchestrator
      // deliberately requires no external receipt for that destination; the
      // completed run supplies the location, while acceptance remains separate.
      const localRun = milestone?.dispatch?.destination === 'workspace-files'
        ? latestRuns.find((run) => run.status === 'completed') : undefined;
      const receipt = latestRuns.find((run) => run.delivery)?.delivery
        ?? (localRun ? { ref: record.folder } : undefined);
      if (!milestone || !receipt || milestone.receipt === receipt.ref) return null;
      const updated: Milestone = { ...milestone, receipt: receipt.ref };
      const staged = settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? updated : m)) }, now);
      items.push(`milestone ${milestone.id} has a delivery receipt at ${receipt.ref}${isAccepted(updated) ? '' : ', but it is not verified and accepted, so it stays verifying'}`);
      const delivery = applyDelivery(staged, updated, now);
      items.push(...delivery.items);
      return delivery.record;
    });
    if (items.length > 0) deps.wake(projectId, { kind: 'dispatch-complete', at: now, items });
  };

  const followRuns = (projectId: string, workspacePath: string, loopId: string): void => {
    const key = `${projectId}:${loopId}`;
    if (runSubscriptions.has(key)) return;
    const file = loopRunsIndexFile(workspacePath, loopId);
    runSubscriptions.set(key, host.onStateChange(file, (state) => enqueue(() => applyRuns(projectId, loopId, runsOf(state)))));
    enqueue(async () => applyRuns(projectId, loopId, runsOf(await host.readJson(file))));
  };

  const apply = async (projectId: string, loops: LoopView[] | null, rooms: RoomView[] | null): Promise<void> => {
    const now = host.now();
    const wakes: Transition[] = [];
    /**
     * Deltas to journal once the record is committed.
     *
     * The store updater can run more than once, so nothing here may write until
     * the figure it reports is the committed one.
     */
    const charges: { source: string; delta: number }[] = [];
    if (rooms) await observeResearchRooms(deps, projectId, rooms);
    if (loops) await observeResearchWorkflows(deps, projectId, loops);
    await store.update(projectId, (record) => {
      charges.length = 0;
      let next = record;
      const workspacePath = workspacePaths.get(projectId);
      for (const milestone of record.milestones) {
        if (milestone.dispatch?.kind === 'workflow' && workspacePath) {
          followRuns(projectId, workspacePath, milestone.dispatch.id);
        }
      }
      for (const milestone of record.milestones) {
        const dispatch = milestone.dispatch;
        if (!dispatch) continue;
        const key = `${projectId}:${dispatch.id}`;
        const loop = dispatch.kind === 'workflow' ? loops?.find((l) => l.id === dispatch.id) : undefined;
        const room = dispatch.kind === 'room' ? rooms?.find((r) => r.id === dispatch.id) : undefined;
        if (!loop && !room) continue;
        const previous = seen.get(key);
        const transition = loop ? loopTransition(milestone, loop, previous) : room ? roomTransition(milestone, room, previous) : null;
        const costUsd = loop ? loop.usage?.costUsd ?? 0 : room?.costUsd ?? 0;
        next = setAccountingIncomplete(next, `${dispatch.kind}:${dispatch.id}`, loop ? !loop.usage || !!loop.usage.incomplete : room?.usageIncomplete !== false);
        const delta = Math.max(0, costUsd - dispatch.chargedUsd);
        let updated: Milestone = milestone;
        if (loop?.status === 'blocked' && loop.block?.limit === 'maxCostUsd' && loop.maxCostUsd !== undefined && dispatch.costLimitUsd !== loop.maxCostUsd) {
          const reason = `Workflow reached its $${loop.maxCostUsd} cap. Approve a new Workflow cap to resume ${milestone.title}.`;
          updated = { ...updated, dispatch: { ...dispatch, failure: reason, costLimitUsd: loop.maxCostUsd } };
          const held = block(next, now, reason);
          if (held.ok) next = { ...held.record, stateLine: reason };
        }
        if (loop?.status === 'blocked' && loop.block?.limit === 'maxWallClockMs') {
          const reason = `Workflow reached its time limit. Use Retry step to continue ${milestone.title} from its saved progress.`;
          if (dispatch.failure !== reason) {
            updated = { ...updated, dispatch: { ...dispatch, failure: reason, retryStepId: undefined, costLimitUsd: undefined } };
            const held = block(next, now, reason);
            if (held.ok) next = { ...held.record, stateLine: reason };
          }
        }
        if (delta > 0) {
          updated = { ...updated, dispatch: { ...updated.dispatch!, chargedUsd: costUsd } };
          next = charge(next, 'dispatched', delta, now);
          charges.push({ source: `dispatch:${dispatch.kind}:${dispatch.id}`, delta });
        }
        if (transition?.reported && updated.status === 'running') {
          updated = { ...updated, status: 'verifying', verification: 'reported' };
        }
        if (room?.deliveryRef && updated.receipt !== room.deliveryRef) {
          updated = { ...updated, receipt: room.deliveryRef };
        }
        if (updated !== milestone) {
          next = { ...next, milestones: next.milestones.map((m) => (m.id === milestone.id ? updated : m)) };
        }
        if (room?.deliveryRef && milestone.receipt !== room.deliveryRef) {
          const delivery = applyDelivery(next, updated, now);
          next = delivery.record;
          wakes.push({
            kind: 'dispatch-complete',
            item: `milestone ${milestone.id} has a delivery receipt at ${room.deliveryRef}${isAccepted(updated) ? '' : ', but it is not verified and accepted, so it stays verifying'}`,
            reported: false,
          });
          for (const item of delivery.items) wakes.push({ kind: 'dispatch-complete', item, reported: false });
        }
        if (transition) wakes.push(transition);
        seen.set(key, {
          status: loop ? loop.status : room?.status ?? '',
          pending: loop ? loop.pendingInput ?? 0 : room?.attentionCount ?? 0,
          lastRunAt: loop?.lastRunAt ?? null,
        });
      }
      return next === record ? null : settle(next, now);
    });
    // A delegated run reports one total, not per-call detail, so it enters the
    // trace as aggregate coverage and stays identifiable as such.
    if (charges.length > 0 && deps.journal) {
      const committed = await store.read(projectId);
      if (committed) {
        for (const entry of charges) {
          await recordCharge({ host, journal: deps.journal }, committed, entry.source, entry.delta, 'aggregate');
        }
      }
    }
    for (const transition of wakes) {
      // An event that starts triage opens its objective's run before the owner's
      // first model call, so the wake and everything it causes stay attributable.
      if (transition.kind === 'external-event' && transition.objectiveId && deps.openMaintenanceRun) {
        await deps.openMaintenanceRun(projectId, transition.objectiveId).catch((error: unknown) => {
          host.log(`could not open the maintenance run for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      deps.wake(projectId, { kind: transition.kind, at: now, items: [transition.item] });
    }
  };

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(work).catch((error: unknown) => {
      host.log(`dispatch watch failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  const workspacePaths = new Map<string, string>();

  return {
    async track(record) {
      if (subscriptions.has(record.id) || !record.workspaceId) return;
      const workspace = (await host.listWorkspaces()).find((ws) => ws.id === record.workspaceId);
      if (!workspace) {
        host.log(`project ${record.id}: workspace ${record.workspaceId} is not registered; nothing to watch`);
        return;
      }
      const files = orchestratorIndexFiles(workspace.path);
      workspacePaths.set(record.id, workspace.path);
      subscriptions.set(record.id, [
        host.onStateChange(files.loops, (state) => enqueue(() => apply(record.id, loopsOf(state), null))),
        host.onStateChange(files.rooms, (state) => enqueue(() => apply(record.id, null, roomsOf(state)))),
      ]);
      // Missed while Sero was closed: read once and apply the transitions.
      const [loopsState, roomsState] = await Promise.all([host.readJson(files.loops), host.readJson(files.rooms)]);
      const loops = loopsOf(loopsState);
      const rooms = roomsOf(roomsState);
      const pending = record.milestones.filter((milestone) => milestone.pendingDispatch && !milestone.pendingDispatch.request);
      const missing = record.milestones
        .filter((milestone) => milestone.status === 'running' && milestone.dispatch)
        .filter((milestone) => milestone.dispatch?.kind === 'workflow'
          ? !loops.some((loop) => loop.id === milestone.dispatch?.id)
          : !rooms.some((room) => room.id === milestone.dispatch?.id));
      if ((pending.length > 0 || missing.length > 0) && record.blockedReason === null) {
        await store.update(record.id, (fresh) => {
          const references = [
            ...pending.map((milestone) => `${milestone.id} started at ${milestone.pendingDispatch?.startedAt}`),
            ...missing.map((milestone) => milestone.dispatch?.id ?? milestone.id),
          ];
          const held = block(fresh, host.now(), `dispatch state could not be confirmed after restart: ${references.join(', ')}`);
          return held.ok ? held.record : null;
        });
      }
      enqueue(() => apply(record.id, loops, rooms));
      await queue;
    },
    untrack(projectId) {
      for (const off of subscriptions.get(projectId) ?? []) off();
      subscriptions.delete(projectId);
      for (const [key, off] of runSubscriptions) {
        if (key.startsWith(`${projectId}:`)) {
          off();
          runSubscriptions.delete(key);
        }
      }
      workspacePaths.delete(projectId);
    },
    flush: () => queue,
    dispose() {
      for (const id of [...subscriptions.keys()]) this.untrack(id);
    },
  };
}
