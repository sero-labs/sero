import { afterEach, describe, expect, it } from 'vitest';
import { orchestratorIndexFiles } from '../dispatch-watch';
import { repairDispatch } from '../repair-dispatch';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

async function setup() {
  const host = await fakeHost();
  const store = await storeFor(host);
  const record = buildingProject({ overlay: 'blocked', blockedReason: 'dispatch state could not be confirmed after restart: m1', milestones: [
    milestone('m1', { status: 'approved', pendingDispatch: { kind: 'workflow', destination: null, startedAt: T0 } }),
  ] });
  await store.write(record);
  host.jsonFiles[orchestratorIndexFiles(record.folder).loops] = { loops: [{ id: 'loop_1', title: 'Existing work', status: 'active' }] };
  return { host, store, record };
}

describe('reconnect workflow', () => {
  it('only lists choices until the user selects one, then restores the link without starting work', async () => {
    const { host, store, record } = await setup();
    const scan = await repairDispatch(store, host, record.id);
    expect(scan.candidates).toEqual([{ id: 'loop_1', title: 'Existing work', status: 'active' }]);
    expect(await store.read(record.id)).toEqual(record);
    expect((await repairDispatch(store, host, record.id, 'loop_1')).ok).toBe(true);
    const fixed = await store.read(record.id);
    expect(fixed?.blockedReason).toBeNull();
    expect(fixed?.milestones[0]).toMatchObject({ status: 'running', dispatch: { id: 'loop_1' } });
    expect(fixed?.milestones[0]?.pendingDispatch).toBeUndefined();
    expect((await repairDispatch(store, host, record.id, 'loop_1')).ok).toBe(false);
  });

  it('does not clear the block when the selected workflow is missing', async () => {
    const { host, store, record } = await setup();
    expect((await repairDispatch(store, host, record.id, 'wrong-workflow')).ok).toBe(false);
    expect(await store.read(record.id)).toEqual(record);
  });

  it('reports an unavailable index without treating it as an empty workspace', async () => {
    const { host, store, record } = await setup();
    host.jsonFiles[orchestratorIndexFiles(record.folder).loops] = null;
    expect((await repairDispatch(store, host, record.id)).ok).toBe(false);
    expect(await store.read(record.id)).toEqual(record);
  });
});
