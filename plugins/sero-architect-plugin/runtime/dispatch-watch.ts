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

import { advancePhase, charge, settle } from '../shared/lifecycle';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { WakeEvent, WakeKind } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

export const ORCHESTRATOR_STATE_DIR = path.join('.sero', 'apps', 'orchestrator');

export function orchestratorIndexFiles(workspacePath: string): { loops: string; rooms: string } {
  const dir = path.join(workspacePath, ORCHESTRATOR_STATE_DIR);
  return { loops: path.join(dir, 'index.json'), rooms: path.join(dir, 'rooms', 'index.json') };
}

/** The per-loop run index, where delivery receipts appear. */
export function loopRunsIndexFile(workspacePath: string, loopId: string): string {
  return path.join(workspacePath, ORCHESTRATOR_STATE_DIR, 'loops', loopId, 'runs', 'index.json');
}

interface RunView {
  id: string;
  status: string;
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
  host: Pick<ArchitectHost, 'onStateChange' | 'readJson' | 'now' | 'log' | 'listWorkspaces'>;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
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
}

function loopTransition(record: ProjectRecord, milestone: Milestone, loop: LoopView, seen: Seen | undefined): Transition | null {
  const pending = loop.pendingInput ?? 0;
  const scheduled = (loop.schedules?.length ?? 0) > 0;
  const label = `milestone ${milestone.id} (Workflow ${loop.id} "${loop.title}")`;
  // A loop that keeps running on events or a schedule reports each run through
  // `lastRunAt`; the maintenance Workflow is one, and its completion never
  // moves its milestone.
  if ((scheduled || milestone.id === 'maintenance') && seen && loop.lastRunAt && loop.lastRunAt !== seen.lastRunAt) {
    return { kind: 'external-event', item: `${label} ran on an event at ${loop.lastRunAt}`, reported: false };
  }
  if (milestone.id === 'maintenance') return null;
  if (loop.status === 'complete' && seen?.status !== 'complete' && milestone.status !== 'done') {
    return { kind: 'dispatch-complete', item: `${label} reported completion; it is a claim until evidence passes`, reported: true };
  }
  if (loop.status === 'blocked' && seen?.status !== 'blocked') {
    return { kind: 'dispatch-blocked', item: `${label} is blocked`, reported: false };
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
   * shows the receipt as delivery evidence only. A delivered release moves the
   * project to maintain.
   */
  const applyRuns = async (projectId: string, loopId: string, runs: RunView[]): Promise<void> => {
    const record = await store.read(projectId);
    if (!record) return;
    const milestone = record.milestones.find((m) => m.dispatch?.kind === 'workflow' && m.dispatch.id === loopId);
    const receipt = runs.map((run) => run.delivery).find((delivery) => delivery !== undefined);
    if (!milestone || !receipt || milestone.receipt === receipt.ref) return;
    const now = host.now();
    const delivered = milestone.verification === 'accepted' || milestone.verification === 'delivered';
    const updated: Milestone = { ...milestone, receipt: receipt.ref, verification: delivered ? 'delivered' : milestone.verification };
    let next = settle({ ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? updated : m)) }, now);
    const items = [`milestone ${milestone.id} has a delivery receipt at ${receipt.ref}${delivered ? '' : ', but it is not verified and accepted, so it stays verifying'}`];
    if (delivered && next.phase === 'release') {
      const advanced = advancePhase({ ...next, stateLine: 'Released. Maintaining.' }, 'maintain', now, `release delivered at ${receipt.ref}`);
      if (advanced.ok) {
        next = advanced.record;
        items.push('the release is delivered; maintain starts');
      }
    }
    await store.write(next);
    deps.wake(projectId, { kind: 'dispatch-complete', at: now, items });
  };

  const followRuns = (projectId: string, workspacePath: string, loopId: string): void => {
    const key = `${projectId}:${loopId}`;
    if (runSubscriptions.has(key)) return;
    const file = loopRunsIndexFile(workspacePath, loopId);
    runSubscriptions.set(key, host.onStateChange(file, (state) => enqueue(() => applyRuns(projectId, loopId, runsOf(state)))));
    enqueue(async () => applyRuns(projectId, loopId, runsOf(await host.readJson(file))));
  };

  const apply = async (projectId: string, loops: LoopView[] | null, rooms: RoomView[] | null): Promise<void> => {
    const record = await store.read(projectId);
    if (!record) return;
    const now = host.now();
    let next = record;
    const wakes: Transition[] = [];
    const workspacePath = workspacePaths.get(projectId);
    for (const milestone of record.milestones) {
      if (milestone.dispatch?.kind === 'workflow' && milestone.dispatch.destination && workspacePath) {
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
      const transition = loop ? loopTransition(record, milestone, loop, previous) : room ? roomTransition(milestone, room, previous) : null;
      const costUsd = loop ? loop.usage?.costUsd ?? 0 : room?.costUsd ?? 0;
      const delta = Math.max(0, costUsd - dispatch.chargedUsd);
      let updated: Milestone = milestone;
      if (delta > 0) {
        updated = { ...updated, dispatch: { ...dispatch, chargedUsd: costUsd } };
        next = charge(next, 'dispatched', delta, now);
      }
      if (transition?.reported && updated.status === 'running') {
        updated = { ...updated, status: 'verifying', verification: 'reported' };
      }
      if (updated !== milestone) {
        next = { ...next, milestones: next.milestones.map((m) => (m.id === milestone.id ? updated : m)) };
      }
      if (transition) wakes.push(transition);
      seen.set(key, {
        status: loop ? loop.status : room?.status ?? '',
        pending: loop ? loop.pendingInput ?? 0 : room?.attentionCount ?? 0,
        lastRunAt: loop?.lastRunAt ?? null,
      });
    }
    if (next !== record) await store.write(settle(next, now));
    for (const transition of wakes) deps.wake(projectId, { kind: transition.kind, at: now, items: [transition.item] });
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
      const [loops, rooms] = await Promise.all([host.readJson(files.loops), host.readJson(files.rooms)]);
      enqueue(() => apply(record.id, loopsOf(loops), roomsOf(rooms)));
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
