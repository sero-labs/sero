import { ORCHESTRATOR_REGISTRY_GLOBAL_KEY, type OrchestratorBoardAction } from '@sero-ai/common';
import { applyRunHealth } from '../run-health';
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
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
  const actions = createProjectsActions({ host, store, sessions, scheduler, watch, services });
  return { host, store, sessions, scheduler, delivered, watch, actions, services };
}

describe('project management', () => {
  it('retries the interrupted step from Architect, keeps completed milestones and respects a pause', async () => {
    const { store, actions } = await setup();
    const record = buildingProject({ milestones: [milestone('m1', { status: 'done' }), milestone('m2', { status: 'running', dispatch: { kind: 'workflow', id: 'loop-2', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 1, destination: 'workspace-files' } })] });
    await store.write(record);
    await applyRunHealth(store, record.id, 'loop-2', [{ status: 'orphaned', startedAt: T0, steps: [{ stepId: 'check-release', status: 'orphaned' }] }], T0);
    const calls: OrchestratorBoardAction[] = [];
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] = new Map([['ws-1', { coordinator: { requestAction: async (action: OrchestratorBoardAction) => { calls.push(action); return { ok: true }; } } }]]);
    try {
      expect(await actions.retry(record.id, 'm2')).toMatchObject({ ok: true });
      expect(calls).toEqual([{ kind: 'retry_step', loopId: 'loop-2', stepId: 'check-release' }]);
      expect((await store.read(record.id))?.milestones[0].status).toBe('done');
      await actions.pause(record.id);
      expect(await actions.retry(record.id, 'm2')).toMatchObject({ ok: false, text: expect.stringContaining('Resume') });
      expect(calls).toHaveLength(1);
    } finally { delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY]; }
  });

  it('starts a managed preview from the visible project folder, not an isolated checkout', async () => {
    const { host, store, actions } = await setup();
    const record = buildingProject();
    await store.write(record);
    vi.spyOn(host, 'detectDevServerCommand').mockResolvedValue('pnpm run dev');
    const start = vi.spyOn(host, 'startDevServer').mockResolvedValue({ serverId: 'preview-1', url: 'http://127.0.0.1:5174' });
    expect(await actions.preview(record.id)).toMatchObject({ ok: true, url: 'http://127.0.0.1:5174' });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: record.workspaceId, workspacePath: record.folder, cwdPath: record.folder, scope: 'workspace' }));
  });

  it('reports a missing preview command without opening a dead URL', async () => {
    const { store, actions } = await setup();
    await store.write(buildingProject());
    expect(await actions.preview('proj_1')).toEqual({ ok: false, text: 'No preview command was found in the project workspace.' });
  });

  it('retains the workspace after git setup fails and retries without creating another', async () => {
    const { host, store, actions } = await setup();
    const exec = vi.spyOn(host, 'exec');
    exec.mockRejectedValueOnce(new Error('git unavailable'));
    const outcome = await actions.create({ idea: 'x', folder: '~/projects/retry' });
    expect(outcome.ok).toBe(true);
    const record = (await store.list())[0]!;
    expect(record.workspaceId).toBeTruthy();
    expect(record.blockedReason).toContain('git unavailable');
    const count = (await host.listWorkspaces()).length;
    expect((await actions.resume(record.id)).ok).toBe(true);
    expect((await host.listWorkspaces()).length).toBe(count);
    expect((await store.read(record.id))?.phase).toBe('discovery');
  });

  it('creates a project: folder, git init, workspace, grant, discovery, first wake', async () => {
    const { host, store, actions, delivered, watch } = await setup();
    const outcome = await actions.create({ idea: 'A roguelike.', folder: '~/projects/hollow' });
    expect(outcome.ok).toBe(true);
    const created = (await store.list())[0]!;
    expect(created.phase).toBe('intake');
    expect(host.sessions.proposals).toHaveLength(0);
    expect(delivered).toHaveLength(0);
    await actions.resume(created.id);
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

  it('reads the owner session through the persistent read-only history API', async () => {
    const { host, store, actions } = await setup();
    await store.write(buildingProject());
    host.sessions.readHistory = vi.fn(async () => ({
      entries: [{ turnIndex: 1, timestamp: T0, role: 'assistant' as const, text: 'Working.' }],
      olderCursor: null,
    }));

    const page = await actions.history('proj_1');

    expect(page?.entries[0]?.text).toBe('Working.');
    expect(host.sessions.readHistory).toHaveBeenCalledWith('grant-1', 'owner', { cursor: undefined, limit: 100 });
  });

  it('keeps a project in intake, blocked, when the grant is refused', async () => {
    const { host, store, actions, delivered } = await setup();
    host.sessions.denyGrant = true;
    const outcome = await actions.create({ idea: 'x', folder: '~/projects/nope' });
    expect(outcome.ok).toBe(true);
    await actions.resume((await store.list())[0]!.id);
    const record = (await store.list())[0]!;
    expect(record.phase).toBe('intake');
    expect(record.overlay).toBe('blocked');
    expect(record.blockedReason).toContain('Permission');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual([]);

    // Resume is the way back in: the grant is asked for again, and the same
    // intake step carries the project into discovery without a second workspace.
    host.sessions.denyGrant = false;
    const workspacesBefore = (await host.listWorkspaces()).length;
    const resumed = await actions.resume(record.id);
    expect(resumed.ok, resumed.text).toBe(true);
    const after = (await store.read(record.id))!;
    expect(after.phase).toBe('discovery');
    expect(after.blockedReason).toBeNull();
    expect(after.session.grantId).toBe('grant-1');
    expect((await host.listWorkspaces()).length).toBe(workspacesBefore);
  });

  it('resume clears a block that was not the user\'s own stop', async () => {
    const { store, actions } = await setup();
    const outcome = await actions.create({ idea: 'x', folder: '~/projects/ok' });
    const id = outcome.ok ? outcome.projectId! : '';
    const record = (await store.read(id))!;
    await store.write({ ...record, blockedReason: 'the owner ended 3 turns in a row without declaring an outcome' });
    const resumed = await actions.resume(id);
    expect(resumed.ok, resumed.text).toBe(true);
    expect((await store.read(id))!.blockedReason).toBeNull();
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
    const live = milestone('m1', {
      status: 'running',
      dispatch: { kind: 'workflow', id: 'loop-live', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 3, destination: null },
    });
    await store.write(buildingProject({ decisions: [decision], milestones: [live] }));
    await actions.answer('proj_1', 'dec_1', 'apply');
    const record = await store.read('proj_1');
    expect(record?.charter).toMatchObject({ capUsd: 90, autonomy: 'charter-only', approvedAt: T0 });
    expect(record?.budget.capUsd).toBe(90);
    expect(record?.milestones.map((m) => m.title)).toEqual(['Replanned']);
    expect(record?.milestones[0]).toMatchObject({ status: 'running', dispatch: { id: 'loop-live', chargedUsd: 3 } });
  });

  it('keeps a dispatch reservation when a charter proposal retains the milestone', async () => {
    const { store, actions } = await setup();
    const proposal = { kind: 'charter' as const, charter: { milestoneIds: ['m1'], escalationPolicy: 'p', autonomy: 'charter-only' as const, capUsd: 90, proposedAt: T0, approvedAt: null }, milestones: [milestone('m1', { title: 'Replanned' })] };
    const decision = { id: 'dec_1', question: 'Apply?', options: [{ id: 'apply', label: 'A', consequence: 'x' }], recommendation: 'apply', reason: 'r', dependsOn: [], raisedAt: T0, proposal, answer: null };
    const pending = milestone('m1', { status: 'approved', pendingDispatch: { kind: 'workflow', destination: null, startedAt: T0 } });
    await store.write(buildingProject({ decisions: [decision], milestones: [pending] }));

    await actions.answer('proj_1', 'dec_1', 'apply');

    expect((await store.read('proj_1'))?.milestones[0]?.pendingDispatch).toEqual({ kind: 'workflow', destination: null, startedAt: T0 });
  });

  it('retains a reserved dispatch whose milestone is absent from the new charter', async () => {
    const { store, actions } = await setup();
    const proposal = { kind: 'charter' as const, charter: { milestoneIds: ['m2'], escalationPolicy: 'p', autonomy: 'charter-only' as const, capUsd: 90, proposedAt: T0, approvedAt: null }, milestones: [milestone('m2', { title: 'Replacement' })] };
    const decision = { id: 'dec_1', question: 'Apply?', options: [{ id: 'apply', label: 'A', consequence: 'x' }], recommendation: 'apply', reason: 'r', dependsOn: [], raisedAt: T0, proposal, answer: null };
    const pending = milestone('m1', { status: 'approved', pendingDispatch: { kind: 'room', destination: 'pr', startedAt: T0 } });
    await store.write(buildingProject({ decisions: [decision], milestones: [pending] }));

    await actions.answer('proj_1', 'dec_1', 'apply');

    expect((await store.read('proj_1'))?.milestones).toEqual([
      expect.objectContaining({ id: 'm2', title: 'Replacement' }),
      expect.objectContaining({ id: 'm1', pendingDispatch: { kind: 'room', destination: 'pr', startedAt: T0 } }),
    ]);
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

  it('rechecks safety gates before applying an approved dispatch and keeps failure retryable', async () => {
    const { store, actions, services } = await setup();
    const proposal = { kind: 'dispatch' as const, milestoneId: 'm1', dispatchKind: 'workflow' as const, prompt: 'Announce it', destination: 'chat-post' };
    const decision = { id: 'dec_1', question: 'Send?', options: [{ id: 'apply', label: 'Send', consequence: 'sent' }], recommendation: 'apply', reason: 'external', dependsOn: [], raisedAt: T0, proposal, answer: null };
    await store.write(buildingProject({ phase: 'release', paused: true, decisions: [decision], milestones: [milestone('m1', { status: 'approved' })] }));

    const outcome = await actions.answer('proj_1', 'dec_1', 'apply');
    expect(outcome).toMatchObject({ ok: false, text: expect.stringContaining('remains open') });
    expect(services.dispatch).not.toHaveBeenCalled();
    expect((await store.read('proj_1'))?.decisions[0]?.answer).toBeNull();
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

  it('keeps a milestone parked until every overlapping decision is answered', async () => {
    const { store, actions } = await setup();
    const option = { id: 'keep', label: 'Keep', consequence: 'No change' };
    const decisions = ['d1', 'd2'].map((id) => ({
      id, question: id, options: [option], recommendation: 'keep', reason: 'test', dependsOn: ['m1'],
      raisedAt: T0, proposal: null, answer: null,
    }));
    await store.write(buildingProject({
      decisions,
      milestones: [milestone('m1', { status: 'parked', parkedBy: 'd1', parkedByDecisions: ['d1', 'd2'], parkedFrom: 'approved' })],
    }));

    expect((await actions.answer('proj_1', 'd1', 'keep')).ok).toBe(true);
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'parked', parkedBy: 'd2' });
    expect((await actions.answer('proj_1', 'd2', 'keep')).ok).toBe(true);
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'approved', parkedBy: null });
  });

  it('frees the scheduler when the user stops the project mid-turn, and delivers again after resume', async () => {
    const { host, store, sessions } = await setup();
    const delivered: string[] = [];
    const gate = createWakeGate();
    gate.release();
    const scheduler = createWakeScheduler({
      gate,
      log: host.log,
      deliver: async (projectId, wake) => {
        const record = await store.read(projectId);
        if (!record) return;
        delivered.push(wake.kind);
        await sessions.runTurn(record, wake);
      },
    });
    const live = createProjectsActions({ host, store, sessions, scheduler, watch: { track: vi.fn(async () => undefined), untrack: vi.fn(), flush: vi.fn(async () => undefined), dispose: vi.fn() }, services: {
      research: vi.fn(async () => ({ id: 'res_1' })),
      dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
      evidence: vi.fn(async () => undefined),
      recoverPending: vi.fn(),
      evidenceIsStale: vi.fn(async () => false),
      maintenance: vi.fn(async (record: ProjectRecord) => record),
    } });
    await store.write(buildingProject());

    // The owner turn never ends on its own: it is still working when the user stops.
    let releaseTurn = (): void => undefined;
    const hanging = new Promise<void>((resolve) => { releaseTurn = resolve; });
    host.sessions.onTurn = async () => { await hanging; };
    scheduler.request('proj_1', { kind: 'quiet', at: T0, items: ['first wake'] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scheduler.isRunning('proj_1')).toBe(true);

    expect((await live.stop('proj_1')).ok).toBe(true);
    await scheduler.idle('proj_1');
    expect(scheduler.isRunning('proj_1')).toBe(false);

    // The scheduler is free, so the wake after resume is delivered.
    host.sessions.onTurn = async () => undefined;
    expect((await live.resume('proj_1')).ok).toBe(true);
    await scheduler.idle('proj_1');
    expect(delivered).toEqual(['quiet', 'quiet']);
    releaseTurn();
  });
});
