import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { createDispatchWatch, loopRunsIndexFile, orchestratorIndexFiles } from '../dispatch-watch';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { createTurnOutcomes } from '../turn-outcomes';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const files = orchestratorIndexFiles('/home/dan/projects/hollow');
const running = (kind: 'workflow' | 'room', id: string) => milestone('m1', { status: 'running', dispatch: { kind, id, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });

async function setup(record = buildingProject({ milestones: [running('workflow', 'loop_1')] })) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const wakes: WakeEvent[] = [];
  const loops = record.milestones.filter((item) => item.dispatch?.kind === 'workflow').map((item) => ({
    id: item.dispatch?.id ?? '', title: item.title, status: 'active', updatedAt: T0,
    ...(item.id === 'maintenance' ? { lastRunAt: '2026-09-08T08:00:00.000Z' } : {}),
  }));
  const rooms = record.milestones.filter((item) => item.dispatch?.kind === 'room').map((item) => ({
    id: item.dispatch?.id ?? '', title: item.title, status: 'running', memberCount: 1, activeMemberCount: 1,
    costUsd: 0, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null,
  }));
  host.jsonFiles[files.loops] = { version: 1, loops };
  host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms };
  const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
  await watch.track(record);
  const settle = () => watch.flush();
  return { host, store, watch, wakes, settle };
}

describe('dispatch watch', () => {
  it('records completed workspace delivery without accepting unverified work and recovers an accepted release', async () => {
    const release = milestone('m1', { status: 'verifying', verification: 'reported',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'workspace-files' } });
    const { host, store, watch, settle } = await setup(buildingProject({ phase: 'release', milestones: [release] }));
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, { runs: [{ id: 'run_1', status: 'running' }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0]?.receipt).toBeNull();
    host.emitState(file, { runs: [{ id: 'run_1', status: 'completed' }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ receipt: '/home/dan/projects/hollow', verification: 'reported' });
    expect((await store.read('proj_1'))?.phase).toBe('release');
    watch.dispose();
    // A previously accepted local release from before this fix recovers when
    // the watcher reads the durable run index during startup.
    await store.write(buildingProject({ phase: 'release', milestones: [{ ...release, status: 'done', verification: 'accepted' }] }));
    host.jsonFiles[file] = { runs: [{ id: 'run_1', status: 'completed' }] };
    const recovered = createDispatchWatch({ host, store, wake: vi.fn() });
    await recovered.track((await store.read('proj_1'))!);
    await recovered.flush();
    expect((await store.read('proj_1'))?.milestones[0]?.verification).toBe('delivered');
    expect((await store.read('proj_1'))?.phase).toBe('maintain');
    recovered.dispose();
  });

  it('shows an interrupted execution even when the workflow remains active, then clears it on retry', async () => {
    const { host, store, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, { runs: [{ id: 'run_1', status: 'orphaned', startedAt: T0 }] });
    await settle();
    const failed = await store.read('proj_1');
    expect(failed?.blockedReason).toContain('Retry step');
    expect(failed?.milestones[0]?.dispatch?.failure).toContain('stopped before it finished');
    host.emitState(file, { runs: [
      { id: 'run_1', status: 'orphaned', startedAt: T0 },
      { id: 'run_2', status: 'running', startedAt: '2026-09-09T00:00:00.000Z' },
    ] });
    await settle();
    const retried = await store.read('proj_1');
    expect(retried?.blockedReason).toBeNull();
    expect(retried?.milestones[0]?.dispatch?.failure).toBeUndefined();
  });

  it('moves a completed Workflow to verifying, never done, and wakes the owner', async () => {
    const { host, store, wakes, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0 }] });
    await settle();
    expect(wakes).toEqual([]);
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'complete', updatedAt: T0, usage: { costUsd: 3 } }] });
    await settle();
    const record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'reported' });
    expect(record?.budget.sources.dispatched).toBe(3);
    expect(record?.milestones[0]?.dispatch?.chargedUsd).toBe(3);
    expect(wakes).toEqual([{ kind: 'dispatch-complete', at: T0, items: ['milestone m1 (Workflow loop_1 "Grid") reported completion; it is a claim until evidence passes'] }]);
  });

  it('charges only the usage delta and wakes once for a question', async () => {
    const { host, store, wakes, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 2 }, pendingInput: 1 }] });
    await settle();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 5 }, pendingInput: 1 }] });
    await settle();
    expect((await store.read('proj_1'))?.budget.sources.dispatched).toBe(5);
    expect(wakes.map((w) => w.kind)).toEqual(['dispatch-blocked']);
  });

  it('holds running work when restart cannot confirm its dispatch record', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [running('workflow', 'missing-loop')] });
    await store.write(record);
    host.jsonFiles[files.loops] = { version: 1, loops: [] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };
    const watch = createDispatchWatch({ host, store, wake: () => undefined });

    await watch.track(record);

    expect((await store.read('proj_1'))?.blockedReason).toContain('missing-loop');
  });

  it('holds a project when restart finds a dispatch intent without a saved link', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [milestone('m1', {
      status: 'approved',
      pendingDispatch: { kind: 'workflow', destination: null, startedAt: T0 },
    })] });
    await store.write(record);
    host.jsonFiles[files.loops] = { version: 1, loops: [] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };
    const watch = createDispatchWatch({ host, store, wake: () => undefined });

    await watch.track(record);

    expect((await store.read('proj_1'))?.blockedReason).toContain('m1 started at');
  });

  it('reads the index once on track, so a completion missed while closed is not lost', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [running('room', 'room_1')] });
    await store.write(record);
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [{ id: 'room_1', title: 'Team', status: 'completed', memberCount: 2, activeMemberCount: 0, costUsd: 4, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null }] };
    const wakes: WakeEvent[] = [];
    const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
    await watch.track(record);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('verifying');
    expect(wakes.map((w) => w.kind)).toEqual(['dispatch-complete']);
  });

  it('reads an existing Room delivery receipt from the watched summary', async () => {
    const release = milestone('m1', {
      status: 'verifying',
      verification: 'verified',
      dispatch: { kind: 'room', id: 'room_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' },
      evidence: { commit: 'abc123', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, filesChanged: false, preview: null, passed: true, stale: false },
    });
    const { host, store, wakes, settle } = await setup(buildingProject({ phase: 'release', milestones: [release] }));
    host.emitState(files.rooms, { schemaVersion: 1, rooms: [{
      id: 'room_1', title: 'Release room', status: 'completed', memberCount: 2, activeMemberCount: 0,
      costUsd: 2, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0,
      deliveredAt: T0, deliveryRef: 'https://github.com/x/y/pull/8',
    }] });
    await settle();

    expect((await store.read('proj_1'))?.milestones[0]?.receipt).toBe('https://github.com/x/y/pull/8');
    expect(wakes.some((wake) => wake.items.some((item) => item.includes('delivery receipt')))).toBe(true);
  });

  it('holds a receipt as delivery evidence until the owner accepts, then delivers and starts maintain', async () => {
    // The real order: the run delivers first, and the owner accepts afterwards.
    const releaseMilestone = milestone('m1', {
      status: 'verifying',
      verification: 'verified',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' },
      evidence: { commit: 'abc123', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, filesChanged: false, preview: null, passed: true, stale: false },
    });
    const { host, store, wakes, settle } = await setup(buildingProject({ phase: 'release', milestones: [releaseMilestone] }));
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Release', status: 'active', updatedAt: T0 }] });
    await settle();
    const runs = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(runs, { version: 1, runs: [{ id: 'run_1', status: 'completed', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/7', summary: 'PR opened', deliveredAt: T0 } }] });
    await settle();
    let record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'verified', receipt: 'https://github.com/x/y/pull/7' });
    expect(record?.phase).toBe('release');
    expect(wakes.at(-1)?.items[0]).toContain('stays verifying');

    // The owner accepts the milestone on its passed evidence.
    const services: OwnerServices = {
      research: vi.fn(async () => ({ id: 'res_1' })),
      dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
      evidence: vi.fn(async () => undefined),
      recoverPending: vi.fn(),
      evidenceIsStale: vi.fn(async () => false),
      maintenance: vi.fn(async (r) => r),
    };
    const actions = createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services });
    const outcome = await actions.execute(
      { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' },
      { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true },
    );
    expect(outcome.ok).toBe(true);
    expect(services.maintenance).toHaveBeenCalledOnce();
    record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'done', verification: 'delivered' });
    expect(record?.phase).toBe('maintain');
    expect(record?.history.at(-1)?.cause).toContain('release delivered at https://github.com/x/y/pull/7');
  });

  it('wakes the owner with an external event when the maintenance Workflow runs again', async () => {
    const maintenance = milestone('maintenance', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_m', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
    const { host, store, wakes, settle } = await setup(buildingProject({ phase: 'maintain', milestones: [maintenance] }));
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-08T08:00:00.000Z' }] });
    await settle();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-09T08:00:00.000Z' }] });
    await settle();
    expect(wakes.map((w) => w.kind)).toEqual(['external-event']);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('running');
  });

  it('takes the limited overlay when dispatched usage reaches the cap, without touching the phase', async () => {
    const { host, store, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 45 } }] });
    await settle();
    const record = await store.read('proj_1');
    expect(record?.overlay).toBe('limited');
    expect(record?.phase).toBe('build');
    expect(record?.milestones[0]?.status).toBe('running');
    expect(record?.history.at(-1)?.cause).toBe('reached the $40 cost cap');
  });
});
