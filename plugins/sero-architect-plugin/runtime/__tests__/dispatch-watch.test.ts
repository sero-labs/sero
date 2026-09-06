import { afterEach, describe, expect, it } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { createDispatchWatch, orchestratorIndexFiles } from '../dispatch-watch';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const files = orchestratorIndexFiles('/home/dan/projects/hollow');
const running = (kind: 'workflow' | 'room', id: string) => milestone('m1', { status: 'running', dispatch: { kind, id, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0 } });

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
