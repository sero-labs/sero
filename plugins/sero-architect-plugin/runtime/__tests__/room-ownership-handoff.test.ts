import { afterEach, expect, it, vi } from 'vitest';
import { ORCHESTRATOR_ROOM_INDEX_FILE, ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY } from '@sero-ai/common';
import { createRoomDispatchHandle } from '../../../sero-orchestrator-plugin/runtime/rooms/room-dispatch-handle';
import { performDispatch } from '../dispatch-link';
import { stopProjectWork } from '../linked-work';
import { createServices } from '../services';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

it.each(['milestone', 'research'] as const)('retains %s ownership before scheduling and through the stopped handoff', async (caller) => {
  for (const cause of ['user-stop', 'budget'] as const) {
    const host = await fakeHost();
    const store = await storeFor(host);
    const reads = vi.spyOn(host, 'readJson');
    const record = agreedProject({ milestones: [milestone('m1', { status: 'approved' })] });
    await store.write(record);
    const identity = async () => {
      const fresh = (await store.read(record.id))!;
      return caller === 'milestone' ? fresh.milestones[0].dispatch?.id : fresh.pendingResearch?.[0]?.roomId;
    };
    let status: 'ready' | 'running' | 'cancelled' = 'ready';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const prompt = vi.fn();
    let member: Promise<void> | undefined;
    const handle = createRoomDispatchHandle({
      prepare: async () => ({ ok: true, roomId: 'owned-room', status: 'ready', clamps: [], usage: { costUsd: 0.25 }, proposal: {
        teamSize: 1, conductorCount: 1, maxWallClockMs: 60000, maxCostUsd: 1, access: [], warnings: [], title: 'Research', approach: 'Read', roles: [], teamRationale: 'One member',
      } }),
      start: async () => {
        expect(await identity()).toBe('owned-room');
        status = 'running';
        member = gate.then(() => { if (status !== 'cancelled') prompt(); });
        return { ok: true };
      },
      inspect: async () => ({ status, result: null, models: [] }),
      pause: async () => ({ ok: true }), resume: async () => ({ ok: true }),
      cancel: async () => { status = 'cancelled'; return { ok: true }; },
    });
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle: {
      ...handle,
      create: async (request: Parameters<typeof handle.create>[0]) => {
        const result = await handle.create(request);
        // The shared handle has detached its abort listener, while its caller
        // still has accounting/link completion to do. Ownership must work now.
        const stopped = await store.update(record.id, (fresh) => cause === 'user-stop'
          ? { ...fresh, blockedReason: 'stopped by the user', stateLine: 'Stopped.' }
          : { ...fresh, budget: { ...fresh.budget, capUsd: fresh.budget.spentUsd }, stateLine: 'Budget reached.' });
        await stopProjectWork({ store, now: () => T0, retryWorkflow: async () => ({ ok: false, text: '' }) }, stopped!, cause);
        release();
        await member;
        finish();
        return result;
      },
    } }]]);
    const services = createServices({ host, store, wake: vi.fn() });
    if (caller === 'milestone') {
      await performDispatch(store, services, record, record.milestones[0], { kind: 'room', prompt: 'Investigate', destination: null, maxCostUsd: 1 }, T0);
    } else {
      await services.research(record, { question: 'Investigate', stoppingCondition: 'Findings', kind: 'room' });
    }
    await finished;
    if (caller === 'research') await vi.waitFor(() => expect(reads.mock.calls.some(([file]) => file.endsWith(ORCHESTRATOR_ROOM_INDEX_FILE))).toBe(true));
    await vi.waitFor(async () => expect((await store.read(record.id))?.cancellation?.cause).toBe(cause));
    expect(await identity()).toBe('owned-room');
    expect(status).toBe('cancelled');
    expect(prompt).not.toHaveBeenCalled();
    const fresh = (await store.read(record.id))!;
    expect(fresh.budget.spentUsd).toBe(record.budget.spentUsd + 0.25);
    if (cause === 'user-stop') expect(fresh.blockedReason).toBe('stopped by the user');
    if (caller === 'milestone') expect(fresh.history.filter((entry) => entry.cause === 'sent to its Room')).toHaveLength(1);
  }
});
