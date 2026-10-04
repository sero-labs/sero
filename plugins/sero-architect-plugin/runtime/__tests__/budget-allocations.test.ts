/**
 * Start budgets (change rework-autonomous-delivery-and-feedback, task 3.1).
 *
 * The cap bounds starts. Work that is running holds what it was promised and
 * has not used, so two starts side by side share the remainder instead of each
 * being offered all of it.
 */

import { ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorRoomCreateRequest, type OrchestratorRoomHandle } from '@sero-ai/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableUsd, outstandingUsd } from '../../shared/budget';
import { charge } from '../../shared/lifecycle';
import type { ProjectRecord } from '../../shared/record';
import { performDispatch, recoverDispatch } from '../dispatch-link';
import type { OwnerServices } from '../owner-actions';
import { createServices } from '../services';
import { agreedProject, cleanupHosts, fakeHost, milestone, roomHandle, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

const budget = (spentUsd: number) => ({ capUsd: 5, spentUsd, incomplete: false, sources: { owner: spentUsd, research: 0, dispatched: 0 } });

function fakeServices(started: { milestoneId: string; allocatedUsd: number | undefined }[]): OwnerServices {
  return {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (record: ProjectRecord) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
    dispatch: vi.fn(async (_record, item) => {
      started.push({ milestoneId: item.id, allocatedUsd: item.pendingDispatch?.allocatedUsd });
      return { id: `loop_${item.id}`, workspaceId: 'ws-1', baseCommit: 'base-1' };
    }),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
}

async function projectWith(spentUsd: number) {
  const host = await fakeHost();
  const store = await storeFor(host);
  // Worktree mode, where two dispatches may run side by side.
  const record = agreedProject({ executionMode: 'worktree', budget: budget(spentUsd), milestones: [milestone('m1', { status: 'approved' }), milestone('m2', { status: 'approved' })] });
  await store.write(record);
  return { host, store, record };
}

const request = (maxCostUsd: number | null) => ({ kind: 'room' as const, prompt: 'Build it.', destination: null, maxCostUsd });

describe('start budgets', () => {
  it('gives two parallel dispatches no more than the remainder between them', async () => {
    const { store, record } = await projectWith(3);
    const started: { milestoneId: string; allocatedUsd: number | undefined }[] = [];
    const services = fakeServices(started);
    const results = await Promise.allSettled([
      performDispatch(store, services, record, record.milestones[0]!, request(1.5), T0),
      performDispatch(store, services, record, record.milestones[1]!, request(1.5), T0),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(started.map((entry) => entry.allocatedUsd)).toEqual([1.5, 0.5]);
    const saved = (await store.read('proj_1'))!;
    expect(outstandingUsd(saved)).toBe(2);
    expect(availableUsd(saved)).toBe(0);
  });

  it('refuses a second start when the first took all that was free', async () => {
    const { store, record } = await projectWith(3);
    const started: { milestoneId: string; allocatedUsd: number | undefined }[] = [];
    const services = fakeServices(started);
    const results = await Promise.allSettled([
      performDispatch(store, services, record, record.milestones[0]!, request(null), T0),
      performDispatch(store, services, record, record.milestones[1]!, request(null), T0),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/held by work/);
    expect(started).toEqual([{ milestoneId: 'm1', allocatedUsd: 2 }]);
    expect((await store.read('proj_1'))!.milestones[1]!.pendingDispatch).toBeUndefined();
  });

  it('counts reported usage once: spend rises and the promise shrinks by the same amount', async () => {
    const { store, record } = await projectWith(3);
    await performDispatch(store, fakeServices([]), record, record.milestones[0]!, request(null), T0);
    // The watcher charges the delta and saves the cumulative figure on the link.
    const reported = await store.update('proj_1', (fresh) => ({
      ...charge(fresh, 'dispatched', 0.5, T0),
      milestones: fresh.milestones.map((item) => item.id === 'm1' && item.dispatch ? { ...item, dispatch: { ...item.dispatch, chargedUsd: 0.5 } } : item),
    }));
    expect(reported!.budget.spentUsd).toBe(3.5);
    expect(outstandingUsd(reported!)).toBe(1.5);
    expect(availableUsd(reported!)).toBe(0);
    // The run ends under its promise: what it did not use is free again.
    const ended = await store.update('proj_1', (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => item.id === 'm1' ? { ...item, status: 'verifying' as const } : item) }));
    expect(outstandingUsd(ended!)).toBe(0);
    expect(availableUsd(ended!)).toBe(1.5);
  });

  it('keeps one promise across a restart and the recovery of an unfinished dispatch', async () => {
    const { host, store, record } = await projectWith(3);
    const failing = fakeServices([]);
    failing.dispatch = vi.fn(async () => { throw new Error('the runtime stopped'); });
    await expect(performDispatch(store, failing, record, record.milestones[0]!, { ...request(1), kind: 'workflow', destination: 'pr' }, T0)).rejects.toThrow('the runtime stopped');
    // A new store reads the same files, as after a restart.
    const reopened = await storeFor(host);
    const afterRestart = (await reopened.read('proj_1'))!;
    expect(afterRestart.milestones[0]!.pendingDispatch?.allocatedUsd).toBe(1);
    expect(outstandingUsd(afterRestart)).toBe(1);
    const started: { milestoneId: string; allocatedUsd: number | undefined }[] = [];
    expect(await recoverDispatch(reopened, fakeServices(started), afterRestart)).toBe(true);
    const recovered = (await reopened.read('proj_1'))!;
    expect(started).toEqual([{ milestoneId: 'm1', allocatedUsd: 1 }]);
    expect(recovered.milestones[0]!.dispatch?.allocatedUsd).toBe(1);
    expect(outstandingUsd(recovered)).toBe(1);
  });

  it('promises research Rooms a bounded start each, and refuses one when nothing is free', async () => {
    const requests: OrchestratorRoomCreateRequest[] = [];
    const handle = roomHandle({
      create: async (roomRequest) => { requests.push(roomRequest); return { ok: true, roomId: `room-${requests.length}` }; },
      inspect: async () => ({ status: 'running', models: [], result: null }),
    });
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = agreedProject({ budget: { ...budget(0), capUsd: 6 } });
    await store.write(record);
    const services = createServices({ host, store, wake: () => undefined });
    const ask = (question: string) => services.research(record, { question, stoppingCondition: 'One answer.', kind: 'room' });
    await ask('Which audio API?');
    await ask('Which test runner?');
    await expect(ask('Which bundler?')).rejects.toThrow(/held by work/);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map((roomRequest) => roomRequest.limits?.maxCostUsd).sort()).toEqual([1, 5]);
    expect((await store.read('proj_1'))!.pendingResearch).toHaveLength(2);
  });
});
