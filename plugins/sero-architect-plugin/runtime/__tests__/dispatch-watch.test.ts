import { afterEach, describe, expect, it } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { createDispatchWatch, loopRunsIndexFile, orchestratorIndexFiles } from '../dispatch-watch';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const files = orchestratorIndexFiles('/home/dan/projects/hollow');
const running = (kind: 'workflow' | 'room', id: string) => milestone('m1', { status: 'running', dispatch: { kind, id, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });

async function setup(record = buildingProject({ milestones: [running('workflow', 'loop_1')] })) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const wakes: WakeEvent[] = [];
  const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
  await watch.track(record);
  const settle = () => watch.flush();
  return { host, store, watch, wakes, settle };
}

describe('dispatch watch', () => {
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

  it('reads the index once on track, so a completion missed while closed is not lost', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [running('room', 'room_1')] });
    await store.write(record);
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [{ id: 'room_1', title: 'Team', status: 'completed', memberCount: 2, activeMemberCount: 0, costUsd: 4, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0 }] };
    const wakes: WakeEvent[] = [];
    const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
    await watch.track(record);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('verifying');
    expect(wakes.map((w) => w.kind)).toEqual(['dispatch-complete']);
  });

  it('shows a receipt as delivery evidence only until the milestone is accepted, then marks it delivered and starts maintain', async () => {
    const release = (verification: 'reported' | 'accepted', status: 'verifying' | 'done') => buildingProject({
      phase: 'release',
      milestones: [milestone('m1', { status, verification, dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' } })],
    });
    const { host, store, wakes, settle } = await setup(release('reported', 'verifying'));
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Release', status: 'active', updatedAt: T0 }] });
    await settle();
    const runs = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(runs, { version: 1, runs: [{ id: 'run_1', status: 'completed', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/7', summary: 'PR opened', deliveredAt: T0 } }] });
    await settle();
    let record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'reported', receipt: 'https://github.com/x/y/pull/7' });
    expect(record?.phase).toBe('release');
    expect(wakes.at(-1)?.items[0]).toContain('stays verifying');

    await store.write(release('accepted', 'done'));
    host.emitState(runs, { version: 1, runs: [{ id: 'run_1', status: 'completed', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/7', summary: 'PR opened', deliveredAt: T0 } }] });
    await settle();
    record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'done', verification: 'delivered' });
    expect(record?.phase).toBe('maintain');
    expect(wakes.at(-1)?.items).toContain('the release is delivered; maintain starts');
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
