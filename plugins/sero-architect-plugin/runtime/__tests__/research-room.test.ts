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
    expect(requests[0]).toMatchObject({ requestId: `${record.id}:${started.id}`, limits: { executionMode: 'workspace', access: 'read-only', maxMembers: 3, models: ['anthropic/claude-fable-5-1'] } });
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

describe('what a research Room may do', () => {
  function registry(handle: OrchestratorRoomHandle) {
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
  }

  it('asks for edit-workspace access and says commands are allowed when the question needs them', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(buildingProject({ phase: 'discovery', charter: null, milestones: [] }));
    const requests: OrchestratorRoomCreateRequest[] = [];
    registry({ create: async (request) => { requests.push(request); return { ok: true, roomId: 'room-2' }; }, inspect: async () => ({ status: 'running', models: [], result: null }) });
    const services = createServices({ host, store, wake: vi.fn() });
    await services.research((await store.read('proj_1'))!, { question: 'Does the suite pass?', stoppingCondition: 'a verdict per criterion', kind: 'room', access: 'edit-workspace' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].limits?.access).toBe('edit-workspace');
    expect(requests[0].mandate).toContain('You may run commands');
    expect(requests[0].mandate).toContain('Do not implement the product.');
  });

  it('turns a planner question into a decision the user can answer, once, instead of blocking the project', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(buildingProject({ phase: 'discovery', charter: null, milestones: [] }));
    let creates = 0;
    registry({
      create: async () => { creates += 1; return { ok: false, error: 'The Room planner needs an answer before it can plan: May the reviewers run the tests?', questions: ['May the reviewers run the tests?'] }; },
      inspect: async () => ({ status: 'running', models: [], result: null }),
    });
    const services = createServices({ host, store, wake: vi.fn() });
    const started = await services.research((await store.read('proj_1'))!, { question: 'Does the suite pass?', stoppingCondition: 'a verdict', kind: 'room' });
    await vi.waitFor(async () => expect((await store.read('proj_1'))?.decisions).toHaveLength(1));
    const record = (await store.read('proj_1'))!;
    expect(record.blockedReason).toBeNull();
    expect(record.decisions[0]).toMatchObject({
      question: expect.stringContaining('May the reviewers run the tests?'),
      recommendation: 'allow-commands',
      proposal: { kind: 'research-access', researchId: started.id },
    });
    expect(record.decisions[0]?.options.map((option) => option.id)).toEqual(['allow-commands', 'answer-note', 'withdraw']);
    // The entry is still pending, and recovery does not ask the planner again while the question is open.
    expect(record.pendingResearch?.[0]?.id).toBe(started.id);
    createServices({ host, store, wake: vi.fn() }).recoverPending(record);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(creates).toBe(1);
    expect((await store.read('proj_1'))?.decisions).toHaveLength(1);
  });
});
