import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../../shared/record';
import type { WakeEvent } from '../../shared/wake';
import { OwnerSessions } from '../owner-session';
import { createProjectsActions } from '../projects-actions';
import { createTurnOutcomes } from '../turn-outcomes';
import { createWakeGate } from '../wake-gate';
import { createWakeScheduler, type WakeScheduler } from '../wake-scheduler';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

async function setup() {
  const host = await fakeHost();
  const store = await storeFor(host);
  const sessions = new OwnerSessions({ host, store, outcomes: createTurnOutcomes() });
  const delivered: { projectId: string; wake: WakeEvent }[] = [];
  const gate = createWakeGate();
  gate.release();
  const scheduler: WakeScheduler = createWakeScheduler({ gate, log: host.log, deliver: async (projectId, wake) => { delivered.push({ projectId, wake }); } });
  const watch = { track: vi.fn(async () => undefined), untrack: vi.fn(), flush: vi.fn(async () => undefined), dispose: vi.fn() };
  const services = {
    research: vi.fn(async () => ({ id: 'res_1' })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1' })),
    evidence: vi.fn(async () => undefined),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
  const actions = createProjectsActions({ host, store, sessions, scheduler, watch, services });
  return { host, store, sessions, scheduler, delivered, watch, actions, services };
}

describe('project management', () => {
  it('creates a project: folder, git init, workspace, grant, discovery, first wake', async () => {
    const { host, store, actions, delivered, watch } = await setup();
    const outcome = await actions.create({ idea: 'A roguelike.', folder: '~/projects/hollow' });
    expect(outcome.ok).toBe(true);
    const record = (await store.list())[0]!;
    expect(record.idea).toBe('A roguelike.');
    expect(record.workspaceId).toBe('ws-hollow');
    expect(record.folder.endsWith('/projects/hollow')).toBe(true);
    expect(host.execCalls).toContainEqual({ file: 'git', args: ['init'], cwd: record.folder });
    expect(host.sessions.proposals[0]).toMatchObject({ workspaceId: 'ws-hollow', owner: `architect:${record.id}` });
    expect(record.phase).toBe('discovery');
    expect(record.session.grantId).toBe('grant-1');
    expect(watch.track).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered.map((d) => d.wake.kind)).toEqual(['quiet']);
    expect(host.index()?.projects[0]).toMatchObject({ id: record.id, phase: 'discovery' });
  });

  it('keeps a project in intake, blocked, when the grant is refused', async () => {
    const { host, store, actions, delivered } = await setup();
    host.sessions.denyGrant = true;
    const outcome = await actions.create({ idea: 'x', folder: '~/projects/nope' });
    expect(outcome.ok).toBe(true);
    const record = (await store.list())[0]!;
    expect(record.phase).toBe('intake');
    expect(record.overlay).toBe('blocked');
    expect(record.blockedReason).toContain('grant');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual([]);
  });

  it('pauses without cancelling a running dispatch, and only a directive gets through', async () => {
    const { host, store, actions, delivered } = await setup();
    await store.write(buildingProject({ milestones: [milestone('m1', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } })] }));
    expect((await actions.pause('proj_1')).ok).toBe(true);
    const paused = await store.read('proj_1');
    expect(paused?.overlay).toBe('paused');
    expect(paused?.milestones[0]?.status).toBe('running');
    expect(host.sessions.disposed).toEqual([]);
    await actions.directive('proj_1', 'Keep the hex grid.');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered.map((d) => d.wake.kind)).toEqual(['directive']);
    expect((await store.read('proj_1'))?.directives[0]).toMatchObject({ text: 'Keep the hex grid.', reply: null });
  });

  it('answers a decision: unparks its milestones and wakes the owner with the option and note', async () => {
    const { store, actions, delivered } = await setup();
    const decision = { id: 'dec_1', question: 'Hex?', options: [{ id: 'hex', label: 'Hex', consequence: 'x' }, { id: 'sq', label: 'Square', consequence: 'y' }], recommendation: 'hex', reason: 'r', dependsOn: ['m2'], raisedAt: T0, proposal: null, answer: null };
    await store.write(buildingProject({ decisions: [decision], milestones: [milestone('m1'), milestone('m2', { status: 'parked', parkedBy: 'dec_1', parkedFrom: 'approved' })] }));
    expect((await store.read('proj_1'))?.overlay).toBe('decision');
    expect((await actions.answer('proj_1', 'dec_1', 'sq', 'Keep it simple.')).ok).toBe(true);
    const record = await store.read('proj_1');
    expect(record?.overlay).toBeNull();
    expect(record?.decisions[0]?.answer).toEqual({ optionId: 'sq', note: 'Keep it simple.', answeredAt: T0 });
    expect(record?.milestones[1]).toMatchObject({ status: 'approved', parkedBy: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered[0]?.wake).toMatchObject({ kind: 'decision', items: ['the user answered decision dec_1 with "sq" and left a note'] });
  });

  it('applies a charter change only when the user picks apply', async () => {
    const { store, actions } = await setup();
    const proposal = { kind: 'charter' as const, charter: { milestoneIds: ['m1'], escalationPolicy: 'p', autonomy: 'charter-only' as const, capUsd: 90, proposedAt: T0, approvedAt: null }, milestones: [milestone('m1', { title: 'Replanned' })] };
    const decision = { id: 'dec_1', question: 'Apply?', options: [{ id: 'apply', label: 'A', consequence: 'x' }, { id: 'keep', label: 'K', consequence: 'y' }], recommendation: 'apply', reason: 'r', dependsOn: [], raisedAt: T0, proposal, answer: null };
    await store.write(buildingProject({ decisions: [decision] }));
    await actions.answer('proj_1', 'dec_1', 'apply');
    const record = await store.read('proj_1');
    expect(record?.charter).toMatchObject({ capUsd: 90, autonomy: 'charter-only', approvedAt: T0 });
    expect(record?.budget.capUsd).toBe(90);
    expect(record?.milestones.map((m) => m.title)).toEqual(['Replanned']);
  });

  it('applies an external-delivery proposal only on apply, and then the send is dispatched', async () => {
    const { store, actions, services } = await setup();
    const proposal = { kind: 'dispatch' as const, milestoneId: 'm1', dispatchKind: 'workflow' as const, prompt: 'Announce it', destination: 'chat-post' };
    const decision = { id: 'dec_1', question: 'Send?', options: [{ id: 'apply', label: 'Send', consequence: 'sent' }, { id: 'keep', label: 'No', consequence: 'not sent' }], recommendation: 'apply', reason: 'external', dependsOn: [], raisedAt: T0, proposal, answer: null };
    await store.write(buildingProject({ phase: 'release', decisions: [decision], milestones: [milestone('m1', { status: 'approved' })] }));
    await actions.answer('proj_1', 'dec_1', 'keep');
    expect(services.dispatch).not.toHaveBeenCalled();
    await store.write(buildingProject({ phase: 'release', decisions: [decision], milestones: [milestone('m1', { status: 'approved' })] }));
    await actions.answer('proj_1', 'dec_1', 'apply');
    expect(services.dispatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'm1' }), expect.objectContaining({ destination: 'chat-post' }));
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'running', dispatch: { id: 'loop_9', destination: 'chat-post' } });
  });

  it('approves the charter into build and a milestone plan into approved', async () => {
    const { store, actions, delivered } = await setup();
    const charterPhase = { ...buildingProject(), phase: 'charter' as const, charter: { ...buildingProject().charter!, approvedAt: null } };
    await store.write(charterPhase);
    expect((await actions.approve('proj_1', 'charter')).ok).toBe(true);
    expect((await store.read('proj_1'))?.phase).toBe('build');
    expect((await actions.approve('proj_1', 'milestone', 'm1')).ok).toBe(true);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('approved');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered.map((d) => d.wake.kind)).toEqual(['decision', 'decision']);
  });

  it('raising the cap on a limited project clears the overlay and wakes the owner with the raise', async () => {
    const { store, actions, delivered } = await setup();
    await store.write(buildingProject({ budget: { capUsd: 40, spentUsd: 41, sources: { owner: 1, research: 0, dispatched: 40 } } }));
    expect((await store.read('proj_1'))?.overlay).toBe('limited');
    await actions.raiseCap('proj_1', 80);
    expect((await store.read('proj_1'))?.overlay).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered[0]?.wake.items).toEqual(['the user raised the cap to $80']);
  });

  it('stops by blocking, closes the session, and delete removes the grant and the record', async () => {
    const { host, store, actions, sessions } = await setup();
    await store.write(buildingProject());
    await sessions.ensureOpen(buildingProject());
    expect((await actions.stop('proj_1')).ok).toBe(true);
    expect((await store.read('proj_1'))?.blockedReason).toBe('stopped by the user');
    expect(host.sessions.disposed).toEqual(['h1']);
    expect((await actions.resume('proj_1')).ok).toBe(true);
    expect((await store.read('proj_1'))?.overlay).toBeNull();
    expect((await actions.delete('proj_1')).ok).toBe(true);
    expect(await store.read('proj_1')).toBeNull();
    expect(host.sessions.deletedGrants).toEqual(['grant-1']);
    expect(host.index()?.projects).toEqual([]);
  });
});
