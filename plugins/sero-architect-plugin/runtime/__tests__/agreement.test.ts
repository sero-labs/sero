/**
 * Delivery agreements (change rework-autonomous-delivery-and-feedback).
 *
 * A project with an agreement is approved once, at the start, and then works
 * without a charter. A project without one is read as it is and keeps its
 * charter gates. These tests hold the authority rules, not the wording.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorRoomCreateRequest, type OrchestratorRoomHandle } from '@sero-ai/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSummary, OVERVIEW_LIMITS } from '../../shared/agreement';
import { mayDispatch } from '../../shared/lifecycle';
import { buildOwnerContract } from '../../shared/owner-contract';
import { toIndexEntry, type ProjectRecord } from '../../shared/record';
import type { WakeEvent } from '../../shared/wake';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { OwnerSessions } from '../owner-session';
import { createProjectsActions } from '../projects-actions';
import { createServices } from '../services';
import { createTurnOutcomes } from '../turn-outcomes';
import { createWakeGate } from '../wake-gate';
import { createWakeScheduler } from '../wake-scheduler';
import { agreedProject, buildingProject, cleanupHosts, fakeHost, milestone, roomHandle, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

const INDEX_OPTIONS = { sessionStartedAt: T0, runtimeRunning: true };
const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };

function fakeServices(): OwnerServices {
  return {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (record: ProjectRecord) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
}

async function management() {
  const host = await fakeHost();
  const store = await storeFor(host);
  const sessions = new OwnerSessions({ host, store, outcomes: createTurnOutcomes() });
  const delivered: WakeEvent[] = [];
  const gate = createWakeGate();
  gate.release();
  const scheduler = createWakeScheduler({ gate, log: host.log, deliver: async (_id, wake) => { delivered.push(wake); } });
  const watch = { track: vi.fn(async () => undefined), untrack: vi.fn(), readSources: vi.fn(async () => null), flush: vi.fn(async () => undefined), dispose: vi.fn() };
  const actions = createProjectsActions({ host, store, sessions, scheduler, watch, services: fakeServices() });
  return { host, store, actions, delivered };
}

async function ownerOf(record: ProjectRecord) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const services = fakeServices();
  const actions = createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services });
  return { host, store, services, actions };
}

const REQUEST = 'Make a small synth.\n\n- keys A to K play one octave\n- "production-ready" is not needed, a POC is fine\n  <b>no frameworks</b>';

describe('a delivery agreement', () => {
  it('keeps the request verbatim and starts no paid work before the start approval', async () => {
    const { host, store, actions, delivered } = await management();
    const outcome = await actions.create({ idea: REQUEST, folder: '~/projects/synth', capUsd: 5 });
    expect(outcome.ok, outcome.text).toBe(true);
    const created = (await (await storeFor(host)).list())[0]!;
    expect(created.idea).toBe(REQUEST);
    expect(created.phase).toBe('intake');
    expect(created.agreement).toMatchObject({ capUsd: 5, approvedAt: null, authority: null });
    expect(created.budget.capUsd).toBeNull();
    expect(host.sessions.proposals).toEqual([]);
    expect(delivered).toEqual([]);
    expect(toIndexEntry(created, INDEX_OPTIONS).flow).toBe('agreement');
    expect((await store.list())).toHaveLength(1);
  });

  it('leaves a refused start reopenable, then works from one approval with no charter', async () => {
    const { host, store, actions, delivered } = await management();
    const outcome = await actions.create({ idea: REQUEST, folder: '~/projects/synth', capUsd: 5 });
    const id = outcome.ok ? outcome.projectId! : '';
    host.sessions.denyGrant = true;
    expect((await actions.resume(id)).ok).toBe(false);
    const refused = (await store.read(id))!;
    expect(refused.phase).toBe('intake');
    expect(refused.agreement).toMatchObject({ approvedAt: null, authority: null, refusedAt: expect.any(String) });
    expect(mayDispatch(refused)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual([]);

    host.sessions.denyGrant = false;
    const resumed = await actions.resume(id);
    expect(resumed.ok, resumed.text).toBe(true);
    const started = (await store.read(id))!;
    // One dialog carried the owner grant and the access the project passes on.
    const proposal = host.sessions.proposals.at(-1)!;
    expect(proposal.delegation).toMatchObject({ delegateAppIds: ['orchestrator'] });
    expect(proposal.delegation!.roles.reader!.permissionProfile).toMatchObject({ filesystem: 'read', commands: 'readOnly' });
    expect(proposal.delegation!.roles.editor!.permissionProfile).toMatchObject({ filesystem: 'write', vcs: 'commit' });
    expect(started.phase).toBe('build');
    expect(started.charter).toBeNull();
    expect(started.budget.capUsd).toBe(5);
    expect(started.agreement).toMatchObject({ revision: 1, approvedAt: expect.any(String), refusedAt: null, authority: { policyId: 'policy-1', workspaceId: started.workspaceId } });
    expect(started.history.some((entry) => entry.phase === 'build' && entry.cause.includes('agreement revision 1'))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered.map((wake) => wake.kind)).toEqual(['quiet']);
  });

  it('revokes the access the project passed on when the project is deleted', async () => {
    const { host, store, actions } = await management();
    await store.write(agreedProject());
    expect((await actions.delete('proj_1')).ok).toBe(true);
    expect(host.sessions.revokedPolicies).toEqual(['policy-1']);
  });

  it('lets the owner add and dispatch work at once, and refuses a charter', async () => {
    const { actions, services, store } = await ownerOf(agreedProject());
    expect(await actions.execute(owner, { action: 'charter', projectId: 'proj_1', milestonesJson: '[{"title":"x"}]', escalationPolicy: 'p', capUsd: 500 }))
      .toMatchObject({ ok: false });
    const added = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', title: 'Playable keyboard', plan: 'Keys A to K play one octave.' });
    expect(added.ok, added.text).toBe(true);
    const dispatched = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'room', prompt: 'Build the keyboard.' });
    expect(dispatched.ok, dispatched.text).toBe(true);
    await vi.waitFor(() => expect(services.dispatch).toHaveBeenCalledOnce());
    const record = (await store.read('proj_1'))!;
    expect(record.charter).toBeNull();
    expect(record.budget.capUsd).toBe(5);
  });

  it('starts nothing once the stored authority is gone', async () => {
    const base = agreedProject({ milestones: [milestone('m1', { status: 'approved' })] });
    const { actions, services } = await ownerOf({ ...base, agreement: { ...base.agreement!, authority: null } });
    expect((await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Build it.' })).ok).toBe(false);
    expect(services.dispatch).not.toHaveBeenCalled();
  });

  it('keeps working edits apart from the request, the cap and the access', async () => {
    const before = agreedProject();
    const { actions, store } = await ownerOf(before);
    const first = await actions.execute(owner, {
      action: 'working', projectId: 'proj_1', objective: 'A synth playable from the keyboard.', approach: 'One HTML file with the Web Audio API.',
      criteriaJson: JSON.stringify([{ id: 'c1', text: 'Keys A to K play one octave', userStated: true }, { id: 'c2', text: 'No console errors on load' }]),
      // A cap on a working edit is not a cap change.
      capUsd: 500,
    });
    expect(first.ok, first.text).toBe(true);
    // The route changes: no approval, no category, and the reason is kept.
    const revised = await actions.execute(owner, {
      action: 'working', projectId: 'proj_1', approach: 'Split the voice into its own module.', reason: 'One file made the envelope hard to test.',
      criteriaJson: JSON.stringify([{ id: 'c1', text: 'Keys A to K play one octave', userStated: true }, { id: 'c3', text: 'The envelope has a unit test' }]),
    });
    expect(revised.ok, revised.text).toBe(true);
    // A user-stated criterion cannot be dropped or relabelled by the owner.
    for (const criteria of [[{ id: 'c3', text: 'The envelope has a unit test' }], [{ id: 'c1', text: 'Keys play', userStated: false }]]) {
      expect((await actions.execute(owner, { action: 'working', projectId: 'proj_1', reason: 'simpler', criteriaJson: JSON.stringify(criteria) })).ok).toBe(false);
    }
    const record = (await store.read('proj_1'))!;
    expect(record.working).toMatchObject({ revision: 2, approach: 'Split the voice into its own module.', reason: 'One file made the envelope hard to test.' });
    expect(record.idea).toBe(before.idea);
    expect(record.agreement).toEqual(before.agreement);
    expect(record.budget.capUsd).toBe(5);
    expect(record.decisions).toEqual([]);
  });

  it('carries the request, later instructions and the approval in every contract', () => {
    const record = agreedProject({
      idea: REQUEST,
      directives: [{ id: 'dir_1', text: 'Use a sine wave by default.', sentAt: T0, reply: { text: 'Done.', repliedAt: T0 } }],
    });
    const contract = buildOwnerContract(record, null);
    expect(contract).toContain('keys A to K play one octave');
    expect(contract).toContain('Use a sine wave by default.');
    expect(contract).toContain('$5');
    expect(contract).not.toContain('Charter:');
  });

  it('names the stored policy on a Room it dispatches, and names none for a charter project', async () => {
    const requests: OrchestratorRoomCreateRequest[] = [];
    const handle = roomHandle({
      create: async (request) => { requests.push(request); return { ok: true, roomId: `room-${requests.length}` }; },
      inspect: async () => null,
    });
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { handle }]]);
    const host = await fakeHost();
    const store = await storeFor(host);
    const services = createServices({ host, store, wake: () => undefined });
    for (const record of [agreedProject({ milestones: [milestone('m1')] }), buildingProject({ id: 'proj_2', executionMode: 'workspace' })]) {
      await store.write(record);
      await services.dispatch(record, milestone('m1'), { kind: 'room', prompt: 'Build it.', destination: null, maxCostUsd: null });
    }
    expect(requests.map((request) => request.delegationPolicyId)).toEqual(['policy-1', undefined]);
  });
});

describe('overview summaries', () => {
  it('refuses a summary over its limit instead of cutting it', () => {
    const long = 'x'.repeat(OVERVIEW_LIMITS.outcome + 1);
    expect(checkSummary('outcome', long)).toMatchObject({ ok: false });
    expect(checkSummary('outcome', '  A small browser synth.  ')).toEqual({ ok: true, text: 'A small browser synth.' });
  });

  it('puts the saved summaries on the index row', () => {
    const record = agreedProject({ overview: { outcome: { text: 'A small browser synth.', at: T0 } } });
    expect(toIndexEntry(record, INDEX_OPTIONS).overview).toEqual({ outcome: 'A small browser synth.' });
  });
});

describe('a project without an agreement', () => {
  it('is read as it is: no agreement added, nothing rewritten, charter gate kept', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    // The shape of a project made before agreements: a proposed $5 charter the
    // user has not approved, and a research Room that already completed.
    const legacy = buildingProject({
      id: 'minisynth', phase: 'charter', autonomy: 'milestones',
      charter: { milestoneIds: ['m1'], escalationPolicy: 'ask on scope', autonomy: 'milestones', capUsd: 5, proposedAt: T0, approvedAt: null },
      budget: { capUsd: null, spentUsd: 0.42, incomplete: false, sources: { owner: 0.2, research: 0.22, dispatched: 0 } },
      research: [{ id: 'res-1', roomId: 'room-7', question: 'Which audio API?', stoppingCondition: 'One recommendation.', result: 'Use the Web Audio API.', costUsd: 0.22, completedAt: T0 }],
      milestones: [milestone('m1')],
    });
    const file = path.join(store.projectsDir, 'minisynth.json');
    await mkdir(store.projectsDir, { recursive: true });
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(file, bytes);

    const read = (await store.read('minisynth'))!;
    await store.list();
    expect(await readFile(file, 'utf8')).toBe(bytes);
    expect(read).toEqual(legacy);
    expect(read.agreement).toBeUndefined();
    expect(toIndexEntry(read, INDEX_OPTIONS)).toMatchObject({ id: 'minisynth', flow: 'charter', capUsd: null, spentUsd: 0.42 });
    expect(mayDispatch(read)).toBe(false);
  });
});
