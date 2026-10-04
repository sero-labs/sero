/**
 * Bounded overview summaries, two-choice decisions and multi-line documents
 * (change rework-autonomous-delivery-and-feedback, task 3.3).
 */

import { ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorRoomCreateRequest, type OrchestratorRoomHandle } from '@sero-ai/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOwnerActionInput } from '../../extension/owner-tool';
import { OVERVIEW_LIMITS } from '../../shared/agreement';
import type { ProjectRecord } from '../../shared/record';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { createServices } from '../services';
import { createTurnOutcomes } from '../turn-outcomes';
import { agreedProject, buildingProject, cleanupHosts, fakeHost, milestone, roomHandle, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };

async function ownerOf(record: ProjectRecord) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const services: OwnerServices = {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (project: ProjectRecord) => ({ projectId: project.id, runId: `run-initial-${project.id}` })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (project: ProjectRecord) => project),
  };
  return { store, actions: createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services }) };
}

describe('overview summaries', () => {
  it('sends an oversized summary back to the owner and saves nothing', async () => {
    const { actions, store } = await ownerOf(agreedProject());
    const long = 'The synth plays. '.repeat(40);
    expect(long.length).toBeGreaterThan(OVERVIEW_LIMITS.outcome);
    const outcome = await actions.execute(owner, { action: 'summary', projectId: 'proj_1', field: 'outcome', text: long });
    expect(outcome.ok).toBe(false);
    expect((await store.read('proj_1'))!.overview).toBeUndefined();
  });

  it('saves a short summary with the work it is about, and changes no state', async () => {
    const before = agreedProject({ milestones: [milestone('m1', { status: 'done' })] });
    const { actions, store } = await ownerOf(before);
    expect((await actions.execute(owner, { action: 'summary', projectId: 'proj_1', field: 'result', text: 'Open index.html. Keys A to K play one octave.' })).ok).toBe(false);
    expect((await actions.execute(owner, { action: 'summary', projectId: 'proj_1', field: 'result', text: 'Open index.html.', sourceKind: 'milestone', sourceId: 'm9' })).ok).toBe(false);
    const saved = await actions.execute(owner, { action: 'summary', projectId: 'proj_1', field: 'result', text: 'Open index.html. Keys A to K play one octave.', sourceKind: 'milestone', sourceId: 'm1' });
    expect(saved.ok, saved.text).toBe(true);
    const record = (await store.read('proj_1'))!;
    expect(record.overview?.result).toMatchObject({ text: 'Open index.html. Keys A to K play one octave.', source: { kind: 'milestone', id: 'm1' } });
    expect({ phase: record.phase, overlay: record.overlay, milestones: record.milestones, agreement: record.agreement })
      .toEqual({ phase: before.phase, overlay: before.overlay, milestones: before.milestones, agreement: before.agreement });
  });
});

describe('decisions the owner writes', () => {
  const options = (count: number) => JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `o${index}`, label: `Option ${index}`, consequence: `Consequence ${index}` })));

  it('have at most two choices', async () => {
    const { actions, store } = await ownerOf(agreedProject());
    const three = await actions.execute(owner, { action: 'decide', projectId: 'proj_1', question: 'On-screen keys?', optionsJson: options(3), recommendation: 'o0', reason: 'It changes the page.' });
    expect(three.ok).toBe(false);
    expect((await store.read('proj_1'))!.decisions).toEqual([]);
    const two = await actions.execute(owner, { action: 'decide', projectId: 'proj_1', question: 'On-screen keys?', optionsJson: options(2), recommendation: 'o0', reason: 'It changes the page.' });
    expect(two.ok, two.text).toBe(true);
    expect((await store.read('proj_1'))!.decisions[0]!.options).toHaveLength(2);
  });
});

describe('a research Room that needs commands', () => {
  async function planWith(record: ProjectRecord) {
    const requests: OrchestratorRoomCreateRequest[] = [];
    const handle = roomHandle({
      // The planner asks until the Room may run commands.
      create: async (request) => {
        requests.push(request);
        return request.limits?.access === 'edit-workspace' ? { ok: true, roomId: 'room-1' } : { ok: false, error: 'needs input', questions: ['May the researchers run npm test?'] };
      },
      inspect: async () => ({ status: 'running', models: [], result: null }),
    });
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(record);
    const services = createServices({ host, store, wake: () => undefined });
    await services.research(record, { question: 'Do the tests pass?', stoppingCondition: 'A yes or no with the output.', kind: 'room' });
    return { requests, store };
  }

  it('is planned again with them, with no question, when the approved start covers commands', async () => {
    const base = agreedProject();
    const editor = { ...base.agreement!.authority!.roles.reader!, permissionProfile: { filesystem: 'write' as const, commands: 'all' as const, network: 'fetch' as const, vcs: 'commit' as const } };
    const record = { ...base, agreement: { ...base.agreement!, authority: { ...base.agreement!.authority!, roles: { ...base.agreement!.authority!.roles, editor } } } };
    const { requests, store } = await planWith(record);
    await vi.waitFor(async () => expect((await store.read('proj_1'))?.pendingResearch?.[0]?.roomId).toBe('room-1'));
    expect(requests.map((request) => request.limits?.access)).toEqual(['read-only', 'edit-workspace']);
    expect((await store.read('proj_1'))!.decisions).toEqual([]);
  });

  it('still asks the user, with all three choices, on a project without an agreement', async () => {
    const { requests, store } = await planWith(buildingProject({ executionMode: 'workspace' }));
    await vi.waitFor(async () => expect((await store.read('proj_1'))?.decisions).toHaveLength(1));
    expect(requests).toHaveLength(1);
    expect((await store.read('proj_1'))!.decisions[0]!.options.map((option) => option.id)).toEqual(['allow-commands', 'answer-note', 'withdraw']);
  });
});

describe('a document with more than one line', () => {
  const MARKDOWN = '# Mini synth\n\nKeys **A to K** play one octave.\n\n- no frameworks\n- it says "offline"\n';

  it('reaches the record as written when it is sent as one JSON string', async () => {
    const { actions, store } = await ownerOf(agreedProject());
    const input = buildOwnerActionInput({ action: 'brief', projectId: 'proj_1', textJson: JSON.stringify(MARKDOWN) });
    if ('error' in input) throw new Error(input.error);
    expect((await actions.execute(owner, input)).ok).toBe(true);
    // The brief is trimmed and otherwise untouched: no heading is read out of it.
    expect((await store.read('proj_1'))!.brief).toBe(MARKDOWN.trim());
  });

  it('refuses a value that is not one JSON string, or both forms at once', () => {
    expect(buildOwnerActionInput({ action: 'brief', projectId: 'proj_1', textJson: '{"a":1}' })).toHaveProperty('error');
    expect(buildOwnerActionInput({ action: 'brief', projectId: 'proj_1', textJson: 'not json' })).toHaveProperty('error');
    expect(buildOwnerActionInput({ action: 'brief', projectId: 'proj_1', text: 'a', textJson: '"b"' })).toHaveProperty('error');
  });
});
