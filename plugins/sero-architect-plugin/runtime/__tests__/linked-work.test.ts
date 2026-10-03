/**
 * Control of linked work (change rework-autonomous-delivery-and-feedback,
 * tasks 3.4 and 3.5). The Architect reaches only the Rooms and Workflows its
 * own project started, recovers the same operation, and leaves more time or
 * money to the user.
 */

import { ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorRoomInspection, type OrchestratorRoomStatus } from '@sero-ai/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../../shared/record';
import type { WakeEvent } from '../../shared/wake';
import { hasSettledHeldRoom, releaseProjectWork } from '../linked-work';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { OwnerSessions } from '../owner-session';
import { createProjectsActions } from '../projects-actions';
import { createTurnOutcomes } from '../turn-outcomes';
import { createWakeGate } from '../wake-gate';
import { createWakeScheduler } from '../wake-scheduler';
import { agreedProject, buildingProject, cleanupHosts, fakeHost, milestone, roomHandle, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };
const MIN = 60_000;

/** Rooms that keep their own state, so a test reads what a call really did. */
function fakeRooms(initial: Record<string, Partial<OrchestratorRoomInspection>>) {
  const rooms = new Map(Object.entries(initial).map(([id, room]) => [id, { status: 'running' as OrchestratorRoomStatus, result: null, models: [], maxWallClockMs: 30 * MIN, activeMs: 5 * MIN, ...room }]));
  const calls: string[] = [];
  const set = (id: string, status: OrchestratorRoomStatus, call: string) => {
    calls.push(call);
    const room = rooms.get(id);
    if (!room) return { ok: false as const, error: `Room not found: ${id}`, status: null };
    rooms.set(id, { ...room, status, hold: status === 'paused' ? { kind: 'user-paused', detail: 'Paused.' } : undefined });
    return { ok: true as const, status };
  };
  const handle = roomHandle({
    inspect: async (id) => rooms.get(id) ?? null,
    create: async () => { calls.push('create'); return { ok: true, roomId: 'room-new' }; },
    pause: async (id) => set(id, 'paused', `pause ${id}`),
    cancel: async (id) => set(id, 'cancelled', `cancel ${id}`),
    resume: async (id, options) => {
      const room = rooms.get(id);
      if (room && options?.maxWallClockMs) rooms.set(id, { ...room, maxWallClockMs: options.maxWallClockMs });
      return set(id, 'running', `resume ${id}${options?.maxWallClockMs ? ` total=${options.maxWallClockMs / MIN}` : ''}`);
    },
  });
  (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
  return { rooms, calls };
}

function fakeServices(): OwnerServices {
  return {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (record: ProjectRecord) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
}

const roomMilestone = (id: string, roomId: string, extra: Record<string, unknown> = {}) =>
  milestone(id, { status: 'running', dispatch: { kind: 'room', id: roomId, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null, ...extra } });

async function setup(record: ProjectRecord) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const services = fakeServices();
  const outcomes = createTurnOutcomes();
  const sessions = new OwnerSessions({ host, store, outcomes });
  const delivered: WakeEvent[] = [];
  const gate = createWakeGate();
  gate.release();
  const scheduler = createWakeScheduler({ gate, log: host.log, deliver: async (_id, wake) => { delivered.push(wake); } });
  const watch = { track: vi.fn(async () => undefined), untrack: vi.fn(), flush: vi.fn(async () => undefined), dispose: vi.fn() };
  return {
    store,
    ownerActions: createOwnerActions({ host, store, outcomes, services }),
    projects: createProjectsActions({ host, store, sessions, scheduler, watch, services }),
  };
}

const control = (operation: 'pause' | 'resume' | 'retry' | 'cancel', target: string, extra: Record<string, unknown> = {}) =>
  ({ action: 'control' as const, projectId: 'proj_1', target, operation, ...extra });

describe('the owner controls linked work', () => {
  it('cannot reach a Room its project did not start', async () => {
    const { calls } = fakeRooms({ 'room-1': {}, 'room-foreign': { status: 'paused' } });
    const { ownerActions } = await setup(agreedProject({ milestones: [roomMilestone('m1', 'room-1')] }));
    for (const target of ['room-foreign', 'm9', 'room-1']) {
      expect((await ownerActions.execute(owner, control('cancel', target))).ok).toBe(false);
    }
    expect((await ownerActions.execute(owner, { ...control('cancel', 'm1'), projectId: 'proj_other' })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('recovers its own paused Room as the same Room, and reports the state it is in', async () => {
    const { calls } = fakeRooms({ 'room-1': {} });
    const { ownerActions, store } = await setup(agreedProject({ milestones: [roomMilestone('m1', 'room-1')] }));
    expect(await ownerActions.execute(owner, control('pause', 'm1'))).toMatchObject({ ok: true, details: { status: 'paused' } });
    expect((await store.read('proj_1'))!.milestones[0]!.dispatch?.heldBy).toBe('owner');
    expect(await ownerActions.execute(owner, control('resume', 'm1'))).toMatchObject({ ok: true, details: { status: 'running' } });
    expect(calls).toEqual(['pause room-1', 'resume room-1']);
    expect((await store.read('proj_1'))!.milestones[0]!.dispatch?.heldBy).toBeUndefined();
  });

  it('does not resume a Room the user paused', async () => {
    const { calls } = fakeRooms({ 'room-1': { status: 'paused', hold: { kind: 'user-paused', detail: 'You paused this Room.' } } });
    const { ownerActions } = await setup(agreedProject({ milestones: [roomMilestone('m1', 'room-1')] }));
    expect((await ownerActions.execute(owner, control('resume', 'm1'))).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('hands back the result of a completed Room without resuming or making another', async () => {
    const { calls } = fakeRooms({ 'room-1': { status: 'completed', result: 'Use the Web Audio API.' } });
    const { ownerActions } = await setup(agreedProject({
      milestones: [roomMilestone('m1', 'room-1')],
      research: [{ id: 'res-1', roomId: 'room-0', question: 'Which API?', stoppingCondition: 'One answer.', result: 'Use the Web Audio API.', costUsd: 0.2, completedAt: T0 }],
    }));
    for (const target of ['m1', 'res-1']) {
      const outcome = await ownerActions.execute(owner, control('resume', target));
      expect(outcome).toMatchObject({ ok: true, text: expect.stringContaining('Use the Web Audio API.') });
    }
    expect(calls).toEqual([]);
  });

  it('asks the user before a Room gets more working time, and then continues the same Room', async () => {
    const { calls, rooms } = fakeRooms({ 'room-1': { status: 'paused', hold: { kind: 'limit-reached', detail: 'The Room reached its time limit.' }, maxWallClockMs: 30 * MIN, activeMs: 30 * MIN } });
    const { ownerActions, projects, store } = await setup(agreedProject({ milestones: [roomMilestone('m1', 'room-1')] }));
    // No total named, or one that is not larger: refused, nothing raised.
    expect((await ownerActions.execute(owner, control('resume', 'm1'))).ok).toBe(false);
    expect((await ownerActions.execute(owner, control('resume', 'm1', { maxMinutes: 30 }))).ok).toBe(false);
    expect((await store.read('proj_1'))!.decisions).toEqual([]);

    const raised = await ownerActions.execute(owner, control('resume', 'm1', { maxMinutes: 60 }));
    expect(raised.ok, raised.text).toBe(true);
    const decision = (await store.read('proj_1'))!.decisions[0]!;
    expect(decision.options).toHaveLength(2);
    expect(decision.proposal).toEqual({ kind: 'room-time', target: 'm1', maxMinutes: 60 });
    expect(calls).toEqual([]);
    const capBefore = (await store.read('proj_1'))!.budget.capUsd;

    expect((await projects.answer('proj_1', decision.id, 'apply')).ok).toBe(true);
    expect(calls).toEqual(['resume room-1 total=60']);
    expect(rooms.get('room-1')).toMatchObject({ status: 'running', maxWallClockMs: 60 * MIN });
    expect((await store.read('proj_1'))!.budget.capUsd).toBe(capBefore);
  });
});

describe('a project pause under an agreement', () => {
  it('holds the Rooms the project started and resumes exactly those', async () => {
    const { calls, rooms } = fakeRooms({
      'room-1': {},
      'room-2': { status: 'paused', hold: { kind: 'user-paused', detail: 'You paused this Room.' } },
      'room-3': {},
    });
    const { projects, store } = await setup(agreedProject({
      executionMode: 'worktree',
      milestones: [roomMilestone('m1', 'room-1'), roomMilestone('m2', 'room-2'), roomMilestone('m3', 'room-3')],
    }));
    expect((await projects.pause('proj_1')).ok).toBe(true);
    expect(calls).toEqual(['pause room-1', 'pause room-3']);
    const paused = (await store.read('proj_1'))!;
    expect(paused.milestones.map((item) => item.dispatch?.heldBy)).toEqual(['project', undefined, 'project']);

    // One Room finishes its last turn while the project is paused.
    rooms.set('room-3', { ...rooms.get('room-3')!, status: 'completed', result: 'Done.' });
    calls.length = 0;
    expect((await projects.resume('proj_1')).ok).toBe(true);
    expect(calls).toEqual(['resume room-1']);
    expect(rooms.get('room-2')!.status).toBe('paused');
    expect((await store.read('proj_1'))!.milestones.map((item) => item.dispatch?.heldBy)).toEqual([undefined, undefined, undefined]);
  });

  it('resumes a Room that was still finishing its turns once it settles', async () => {
    const { calls, rooms } = fakeRooms({ 'room-1': {} });
    const { projects, store } = await setup(agreedProject({ milestones: [roomMilestone('m1', 'room-1')] }));
    expect((await projects.pause('proj_1')).ok).toBe(true);
    // The Room is draining: a turn is still in flight when the user resumes.
    rooms.set('room-1', { ...rooms.get('room-1')!, status: 'pausing' });
    calls.length = 0;
    expect((await projects.resume('proj_1')).ok).toBe(true);
    expect(calls).toEqual([]);
    const draining = (await store.read('proj_1'))!;
    expect(draining.milestones[0]!.dispatch?.heldBy).toBe('project');
    expect(hasSettledHeldRoom(draining, [{ id: 'room-1', status: 'pausing' }])).toBe(false);

    // The turn ends. The Room index reports it paused, and the release runs.
    rooms.set('room-1', { ...rooms.get('room-1')!, status: 'paused', hold: { kind: 'user-paused', detail: 'Paused.' } });
    expect(hasSettledHeldRoom(draining, [{ id: 'room-1', status: 'paused' }])).toBe(true);
    await releaseProjectWork({ store, retryWorkflow: async () => ({ ok: false, text: 'not used' }) }, draining);
    expect(calls).toEqual(['resume room-1']);
    expect((await store.read('proj_1'))!.milestones[0]!.dispatch?.heldBy).toBeUndefined();
  });

  it('leaves the Rooms of a charter-flow project running, as before', async () => {
    const { calls } = fakeRooms({ 'room-1': {} });
    const { projects } = await setup(buildingProject({ executionMode: 'workspace', milestones: [roomMilestone('m1', 'room-1')] }));
    expect((await projects.pause('proj_1')).ok).toBe(true);
    expect((await projects.resume('proj_1')).ok).toBe(true);
    expect(calls).toEqual([]);
  });
});
