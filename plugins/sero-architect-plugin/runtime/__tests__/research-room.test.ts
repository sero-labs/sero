import { createRunJournal } from '../run-journal';
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
    const listModels = host.listModels;
    host.listModels = async () => [...await listModels(), { provider: 'openai-codex', displayName: 'OpenAI', logo: '', models: [{ provider: 'openai-codex', modelId: 'gpt-5.6-luna', name: 'Luna', reasoning: true, availableThinkingLevels: ['off', 'low'] }] }];
    const record = buildingProject({ modelOverrides: { MED: { provider: 'openai-codex', modelId: 'gpt-5.6-luna', thinkingLevel: 'off' } }, phase: 'discovery', charter: null, milestones: [], idea: 'A small reading tracker.' });
    const journal = createRunJournal({ homeDir: await host.homeDir() });
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
    const deps = { host, store, wake, journal };
    const services = createServices(deps);
    const started = await services.research(record, { question: 'What should the first version do?', stoppingCondition: 'A bounded proposal and unresolved user choices.', kind: 'room' });
    await vi.waitFor(async () => expect((await store.read(record.id))?.pendingResearch?.[0]?.roomId).toBe('room-1'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ requestId: `${record.id}:${started.id}`, limits: { executionMode: 'workspace', access: 'read-only', maxMembers: 3, models: ['openai-codex/gpt-5.6-luna'], thinkingLevels: ['off'] } });
    expect(requests[0].project).toMatchObject({ runId: `run-initial-${record.id}`, modelSnapshot: { MED: { modelId: 'gpt-5.6-luna', thinkingLevel: 'off' } } });
    expect(requests[0].mandate).toContain(record.idea);
    const reopened = await storeFor(host);
    const pending = (await reopened.read(record.id))!;
    const recoveredServices = createServices({ host, store: reopened, wake });
    recoveredServices.recoverPending(pending);
    const room: OrchestratorBoardRoomView = { id: 'room-1', title: 'Discovery', status, memberCount: 2, activeMemberCount: 1, costUsd: 0.4, maxCostUsd: 5, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null };
    await observeResearchRooms({ host, store: reopened, wake, journal }, record.id, [room]);
    await observeResearchRooms({ host, store: reopened, wake, journal }, record.id, [room]);
    expect((await reopened.read(record.id))?.budget.sources.research).toBe(0.4);
    status = 'completed';
    await observeResearchRooms({ host, store: reopened, wake, journal }, record.id, [{ ...room, status, costUsd: 0.6 }]);
    await observeResearchRooms({ host, store: reopened, wake, journal }, record.id, [{ ...room, status, costUsd: 0.6 }]);
    const finished = (await reopened.read(record.id))!;
    expect(requests).toHaveLength(1);
    expect(finished.pendingResearch).toEqual([]);
    const page = await journal.readPage(record.id, `run-initial-${record.id}`);
    expect(page.records.reduce((total, entry) => total + (typeof entry.costUsd === 'number' ? entry.costUsd : 0), 0)).toBeCloseTo(finished.budget.sources.research);
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
    // Commands are isolated even though the project itself runs in workspace mode.
    expect(requests[0].limits?.executionMode).toBe('worktree');
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

  it('plans on the record as it is after the wait, and keeps a restart that arrives while a start is in flight', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const decision = {
      id: 'dec_1', question: 'The research Room asked: may it run the tests?', recommendation: 'allow-commands', reason: 'r', dependsOn: [], raisedAt: T0, answer: null,
      options: [{ id: 'allow-commands', label: 'a', consequence: 'x' }, { id: 'withdraw', label: 'c', consequence: 'z' }],
      proposal: { kind: 'research-access' as const, researchId: 'res_1' },
    };
    const entry = { id: 'res_1', kind: 'room' as const, question: 'Does the suite pass?', stoppingCondition: 'a verdict', startedAt: T0, attempts: 1 };
    await store.write(buildingProject({ phase: 'discovery', charter: null, milestones: [], decisions: [decision], pendingResearch: [entry] }));
    const requests: OrchestratorRoomCreateRequest[] = [];
    // No registry yet: recovery starts, holds the entry, and waits for it.
    const services = createServices({ host, store, wake: vi.fn() });
    services.recoverPending((await store.read('proj_1'))!);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The user answers while that start is still waiting. The answer write and
    // the restart are what the projects action does.
    await store.update('proj_1', (fresh) => ({
      ...fresh,
      decisions: fresh.decisions.map((item) => ({ ...item, answer: { optionId: 'allow-commands', note: null, answeredAt: T0 } })),
      pendingResearch: fresh.pendingResearch?.map((item) => ({ ...item, access: 'edit-workspace' as const, attempts: 0 })),
    }));
    services.restartResearch((await store.read('proj_1'))!, 'res_1');
    registry({ create: async (request) => { requests.push(request); return { ok: true, roomId: 'room-4' }; }, inspect: async () => ({ status: 'running', models: [], result: null }) });
    await vi.waitFor(async () => expect((await store.read('proj_1'))?.pendingResearch?.[0]?.roomId).toBe('room-4'));
    // One plan, with the answered access: a stale copy of the record would have
    // seen an open decision and planned nothing; a dropped restart likewise.
    expect(requests).toHaveLength(1);
    expect(requests[0].limits).toMatchObject({ access: 'edit-workspace', executionMode: 'worktree' });
  });

  it('retains the saved project selection when the user enables commands after global defaults change', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ phase: 'discovery', charter: null, milestones: [] });
    await store.write(record);
    const requests: OrchestratorRoomCreateRequest[] = [];
    registry({
      create: async (request) => {
        requests.push(request);
        return requests.length === 1
          ? { ok: false, error: 'Need commands', questions: ['May I run tests?'] }
          : { ok: true, roomId: 'room-enabled' };
      },
      inspect: async () => ({ status: 'running', models: [], result: null }),
    });
    const services = createServices({ host, store, wake: vi.fn() });
    const started = await services.research(record, { question: 'Does it pass?', stoppingCondition: 'A test result', kind: 'room' });
    await vi.waitFor(async () => expect((await store.read(record.id))?.decisions).toHaveLength(1));
    host.modelTiers = async () => ({ MED: { provider: 'other-provider', modelId: 'expensive' } });
    await store.update(record.id, (fresh) => ({ ...fresh,
      decisions: fresh.decisions.map((decision) => ({ ...decision, answer: { optionId: 'allow-commands', note: null, answeredAt: T0 } })),
      pendingResearch: fresh.pendingResearch?.map((entry) => ({ ...entry, access: 'edit-workspace' as const, attempts: 0 })),
    }));
    services.restartResearch((await store.read(record.id))!, started.id);
    await vi.waitFor(async () => expect((await store.read(record.id))?.pendingResearch?.[0]?.roomId).toBe('room-enabled'));
    expect(requests).toHaveLength(2);
    expect(requests[1].project).toEqual(requests[0].project);
    expect(requests[1].limits).toMatchObject({ access: 'edit-workspace', executionMode: 'worktree', models: ['anthropic/claude-fable-5-1'] });
  });

});

/**
 * What the record keeps when a research Room ends without reporting.
 *
 * The captured defect: `blockedReason` carried the Room's id, its status and
 * an instruction inside one sentence, and nothing else was saved. The page
 * could only show the id, and the reason the Room could not run commands was
 * one line among sixty-four History entries.
 */
describe('a research Room that ends without reporting', () => {
  async function blockOn(status: OrchestratorBoardRoomView['status'], access: 'read-only' | 'edit-workspace' = 'read-only', withDecision = true) {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ phase: 'discovery', charter: null, milestones: [] });
    const pending = { id: 'res-1', question: 'q', stoppingCondition: 's', startedAt: T0, kind: 'room' as const, roomId: 'room-9', access };
    await store.write({
      ...record,
      pendingResearch: [pending],
      decisions: withDecision
        ? [{
            id: 'dec-1', question: 'The research Room asked for a shell.', options: [], recommendation: '',
            reason: 'The Room planner cannot plan research res-1 without this answer.',
            dependsOn: [], raisedAt: T0,
            proposal: { kind: 'research-access' as const, researchId: 'res-1' },
            answer: { optionId: 'withdraw', note: null, answeredAt: T0 },
          }]
        : [],
    });
    const handle: OrchestratorRoomHandle = {
      create: async () => ({ ok: true, roomId: 'room-9' }),
      inspect: async () => ({ status, models: [], result: null }),
    };
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
    const room: OrchestratorBoardRoomView = {
      id: 'room-9', title: 'Import Dashboard Discovery', status, memberCount: 2, activeMemberCount: 0,
      costUsd: 0.2, maxCostUsd: 5, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null,
    };
    await observeResearchRooms({ host, store, wake: vi.fn() }, record.id, [room]);
    return (await store.read(record.id))!;
  }

  it('saves the Room title, its state and the time, not just a sentence', async () => {
    const blocked = await blockOn('cancelled');
    expect(blocked.blockedOn).toMatchObject({ kind: 'room', id: 'room-9', title: 'Import Dashboard Discovery', status: 'cancelled' });
    expect(blocked.blockedOn?.at).toBeTruthy();
  });

  it('links the access decision as the cause', async () => {
    const blocked = await blockOn('cancelled');
    expect(blocked.blockedOn?.cause).toMatchObject({
      text: 'Its members had read-only access and could not run commands.',
      decisionId: 'dec-1',
    });
  });

  it('saves no cause when nothing recorded one', async () => {
    const blocked = await blockOn('cancelled', 'read-only', false);
    expect(blocked.blockedOn?.title).toBe('Import Dashboard Discovery');
    expect(blocked.blockedOn?.cause).toBeUndefined();
  });

  it('never reads the planning-attempt count as a number of times the Room stopped', async () => {
    const blocked = await blockOn('cancelled');
    expect(JSON.stringify(blocked.blockedOn)).not.toContain('attempts');
    expect(blocked.blockedOn?.cause?.text ?? '').not.toMatch(/stopped (once|twice|\d+ times)/);
  });
});
