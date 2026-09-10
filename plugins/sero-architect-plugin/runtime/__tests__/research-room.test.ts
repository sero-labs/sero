import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorBoardRoomView, type OrchestratorRoomCreateRequest, type OrchestratorRoomHandle } from '@sero-ai/common';
import { buildOwnerContract } from '../../shared/owner-contract';
import { createServices } from '../services';
import { observeResearchRooms } from '../research-room';
import { buildingProject, cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

describe('discovery through a Room', () => {
  it('creates a Room before any charter, resumes its link and feeds durable findings to the owner once', async () => {
    const host = await fakeHost();
    const record = buildingProject({ phase: 'discovery', charter: null, milestones: [], idea: 'A small reading tracker.' });
    const store = await storeFor(host);
    await store.write(record);
    const requests: OrchestratorRoomCreateRequest[] = [];
    let status: OrchestratorBoardRoomView['status'] = 'running';
    const models = [{ name: 'Researcher', model: 'anthropic/claude-fable-5-1', thinking: 'medium' }];
    const handle: OrchestratorRoomHandle = {
      create: async (request) => { requests.push(request); return { ok: true, roomId: 'room-1' }; },
      inspect: async () => ({ status, models, result: status === 'completed' ? 'Use a local database. First deliver creating and retaining one book. Ask whether sharing is needed.' : null }),
    };
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
    const wake = vi.fn();
    const deps = { host, store, wake };
    const services = createServices(deps);
    const started = await services.research(record, { question: 'What should the first version do?', stoppingCondition: 'A bounded proposal and unresolved user choices.', kind: 'room' });
    await vi.waitFor(async () => expect((await store.read(record.id))?.pendingResearch?.[0]?.roomId).toBe('room-1'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ requestId: `${record.id}:${started.id}`, limits: { access: 'read-only', maxMembers: 3, models: ['anthropic/claude-fable-5-1'] } });
    expect(requests[0].mandate).toContain(record.idea);
    const reopened = await storeFor(host);
    const pending = (await reopened.read(record.id))!;
    const recoveredServices = createServices({ host, store: reopened, wake });
    recoveredServices.recoverPending(pending);
    const room: OrchestratorBoardRoomView = { id: 'room-1', title: 'Discovery', status, memberCount: 2, activeMemberCount: 1, costUsd: 0.4, maxCostUsd: 5, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null };
    await observeResearchRooms({ host, store: reopened, wake }, record.id, [room]);
    await observeResearchRooms({ host, store: reopened, wake }, record.id, [room]);
    expect((await reopened.read(record.id))?.budget.sources.research).toBe(0.4);
    status = 'completed';
    await observeResearchRooms({ host, store: reopened, wake }, record.id, [{ ...room, status, costUsd: 0.6 }]);
    await observeResearchRooms({ host, store: reopened, wake }, record.id, [{ ...room, status, costUsd: 0.6 }]);
    const finished = (await reopened.read(record.id))!;
    expect(requests).toHaveLength(1);
    expect(finished.pendingResearch).toEqual([]);
    expect(finished.budget.sources.research).toBe(0.6);
    expect(finished.research).toHaveLength(1);
    expect(finished.research[0]).toMatchObject({ roomId: 'room-1', models });
    expect(buildOwnerContract(finished, null)).toContain('Use a local database.');
    expect(finished.phase).toBe('discovery');
    expect(finished.milestones).toEqual([]);
    expect(wake).toHaveBeenCalledTimes(1);
  });
});
