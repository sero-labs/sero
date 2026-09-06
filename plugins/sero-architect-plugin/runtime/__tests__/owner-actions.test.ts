import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { createTurnOutcomes } from '../turn-outcomes';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };

async function setup(recordOverrides = {}) {
  const host = await fakeHost();
  const store = await storeFor(host);
  const outcomes = createTurnOutcomes();
  const services: OwnerServices = {
    research: vi.fn(async () => ({ id: 'res_1' })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1' })),
    evidence: vi.fn(async () => undefined),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record) => record),
  };
  const record = buildingProject(recordOverrides);
  await store.write(record);
  const actions = createOwnerActions({ host, store, outcomes, services });
  return { host, store, outcomes, services, actions, record };
}

describe('owner actions', () => {
  it('refuses a caller that is not an owner session', async () => {
    const { actions } = await setup();
    const outcome = await actions.execute({ sessionPath: '/sessions/chat.jsonl', cwd: null }, { action: 'sleep', projectId: 'proj_1' });
    expect(outcome).toEqual({ ok: false, text: expect.stringContaining('not one') });
  });

  it('refuses a foreign project id and leaves the record unchanged', async () => {
    const { actions, store, record } = await setup();
    const outcome = await actions.execute(owner, { action: 'brief', projectId: 'proj_other', text: 'x' });
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain('proj_other');
    expect(await store.read('proj_1')).toEqual(record);
  });

  it('refuses a charter without a cap', async () => {
    const { actions } = await setup(buildingProject({ phase: 'discovery', charter: null, milestones: [], budget: { capUsd: null, spentUsd: 0, sources: { owner: 0, research: 0, dispatched: 0 } } }));
    const outcome = await actions.execute(owner, { action: 'charter', projectId: 'proj_1', milestonesJson: '[{"title":"Grid"}]', escalationPolicy: 'p' });
    expect(outcome).toEqual({ ok: false, text: expect.stringContaining('cap') });
  });

  it('records a decision instead of applying a charter change once the charter is approved', async () => {
    const { actions, store, outcomes } = await setup();
    const outcome = await actions.execute(owner, { action: 'charter', projectId: 'proj_1', milestonesJson: '[{"title":"New plan"}]', escalationPolicy: 'p', capUsd: 90 });
    expect(outcome.ok).toBe(true);
    const record = await store.read('proj_1');
    expect(record?.charter?.capUsd).toBe(40);
    expect(record?.milestones.map((m) => m.title)).toEqual(['Milestone m1', 'Milestone m2']);
    expect(record?.decisions).toHaveLength(1);
    expect(record?.decisions[0]).toMatchObject({ recommendation: 'apply', proposal: { kind: 'charter', charter: expect.objectContaining({ capUsd: 90 }) } });
    expect(record?.overlay).toBe('decision');
    expect(outcomes.end('proj_1')).toBe('decide');
  });

  it('refuses an evidence call that carries an exit code or a capture', async () => {
    const { actions, services } = await setup();
    const outcome = await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['pnpm test'], extraKeys: ['exitCode', 'capturePath'] });
    expect(outcome).toEqual({ ok: false, text: expect.stringContaining('exitCode, capturePath') });
    expect(services.evidence).not.toHaveBeenCalled();
  });

  it('starts an evidence run with commands and the route only', async () => {
    const { actions, services } = await setup();
    const outcome = await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['pnpm test'], route: '/' });
    expect(outcome.ok).toBe(true);
    expect(services.evidence).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'm1' }), { commands: ['pnpm test'], route: '/' });
  });

  it('refuses to close a milestone on a completion claim and names the missing evidence', async () => {
    const { actions, store } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'verifying', verification: 'reported' })] }));
    const outcome = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(outcome).toEqual({ ok: false, text: expect.stringContaining('no evidence run has happened') });
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('verifying');
  });

  it('refuses to close on a failed command and a missing capture, and accepts on passed evidence', async () => {
    const failed = milestone('m1', {
      status: 'verifying', verification: 'reported', preview: { route: '/' },
      evidence: { commit: 'abc', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 1, output: 'boom', durationMs: 5 }], diffSummary: '1 file', preview: { route: '/', smokePassed: true, capturePath: null }, passed: false, stale: false },
    });
    const { actions, store } = await setup(buildingProject({ milestones: [failed] }));
    const refused = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(refused.text).toContain('"pnpm test" failed with exit code 1');
    expect(refused.text).toContain('no capture was recorded');

    const passed = { ...failed, verification: 'verified' as const, evidence: { ...failed.evidence!, passed: true, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 5 }], preview: { route: '/', smokePassed: true, capturePath: '/x.png' } } };
    await store.write(buildingProject({ milestones: [passed] }));
    const accepted = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(accepted.ok).toBe(true);
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'done', verification: 'accepted' });
  });

  it('shows a delivery receipt as evidence of delivery only; without verification the milestone stays verifying', async () => {
    const receipted = milestone('m1', {
      status: 'verifying', verification: 'reported', receipt: 'https://github.com/x/y/pull/7',
      evidence: { commit: 'abc', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 1, output: 'boom', durationMs: 5 }], diffSummary: null, preview: null, passed: false, stale: false },
    });
    const { actions, store } = await setup(buildingProject({ milestones: [receipted] }));
    const outcome = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(outcome.ok).toBe(false);
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'reported', receipt: 'https://github.com/x/y/pull/7' });
  });

  it('marks stale evidence, reruns it and refuses to close', async () => {
    const verified = milestone('m1', {
      status: 'verifying', verification: 'verified',
      evidence: { commit: 'abc', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 5 }], diffSummary: null, preview: null, passed: true, stale: false },
    });
    const { actions, store, services } = await setup(buildingProject({ milestones: [verified] }));
    (services.evidenceIsStale as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const outcome = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(outcome).toEqual({ ok: false, text: expect.stringContaining('stale') });
    expect((await store.read('proj_1'))?.milestones[0]?.evidence?.stale).toBe(true);
    expect(services.evidence).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'm1' }), { commands: ['pnpm test'], route: null });
  });

  it('dispatches an approved milestone through the service and links the id', async () => {
    const { actions, store, services } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'approved' })] }));
    const outcome = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Build the grid' });
    expect(outcome.ok).toBe(true);
    expect(services.dispatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'm1' }), { kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: null });
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'running', dispatch: { kind: 'workflow', id: 'loop_9', workspaceId: 'ws-1' } });
  });

  it('turns an external delivery into a decision before anything is sent', async () => {
    const { actions, store, services, outcomes } = await setup(buildingProject({ phase: 'release', milestones: [milestone('m1', { status: 'approved' })] }));
    const outcome = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Announce it', destination: 'chat-post' });
    expect(outcome.ok).toBe(true);
    expect(outcome.text).toContain('decision dec_1');
    expect(services.dispatch).not.toHaveBeenCalled();
    const record = await store.read('proj_1');
    expect(record?.milestones[0]?.status).toBe('approved');
    expect(record?.decisions[0]).toMatchObject({ reason: 'chat-post is an external destination', proposal: { kind: 'dispatch', destination: 'chat-post', milestoneId: 'm1' } });
    expect(outcomes.end('proj_1')).toBe('decide');
  });

  it('runs a release to a pull request directly', async () => {
    const { actions, services } = await setup(buildingProject({ phase: 'release', milestones: [milestone('m1', { status: 'approved' })] }));
    const outcome = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Open the release PR', destination: 'pr' });
    expect(outcome.ok).toBe(true);
    expect(services.dispatch).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ destination: 'pr' }));
  });

  it('turns a run that would spend beyond the cap into a decision', async () => {
    const { actions, store, services } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'approved' })], budget: { capUsd: 40, spentUsd: 35, sources: { owner: 5, research: 0, dispatched: 30 } } }));
    const outcome = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Big job', maxCostUsd: 20 });
    expect(outcome.text).toContain('decision dec_1');
    expect(services.dispatch).not.toHaveBeenCalled();
    expect((await store.read('proj_1'))?.decisions[0]).toMatchObject({ reason: 'the run would spend beyond the approved cap', proposal: { kind: 'cap', capUsd: 55 } });
  });

  it('moves the project to release when the last milestone is accepted', async () => {
    const passed = milestone('m2', { status: 'verifying', verification: 'verified', evidence: { commit: 'abc', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, preview: null, passed: true, stale: false } });
    const { actions, store } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'done', verification: 'accepted' }), passed] }));
    const outcome = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm2', done: true });
    expect(outcome.text).toContain('in release');
    expect((await store.read('proj_1'))?.phase).toBe('release');
  });

  it('refuses to dispatch a planned milestone under milestones autonomy', async () => {
    const { actions, services } = await setup();
    const outcome = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'x' });
    expect(outcome.text).toContain("needs the user's approval");
    expect(services.dispatch).not.toHaveBeenCalled();
  });

  it('parks the milestones a decision names and declares the outcome', async () => {
    const { actions, store, outcomes } = await setup();
    const outcome = await actions.execute(owner, {
      action: 'decide', projectId: 'proj_1', question: 'Hex or square?', recommendation: 'hex', reason: 'charter is silent', parks: ['m2'],
      optionsJson: JSON.stringify([{ id: 'hex', label: 'Hex', consequence: 'harder' }, { id: 'square', label: 'Square', consequence: 'simpler' }]),
    });
    expect(outcome.ok).toBe(true);
    const record = await store.read('proj_1');
    expect(record?.milestones.find((m) => m.id === 'm2')).toMatchObject({ status: 'parked', parkedBy: 'dec_1', parkedFrom: 'planned' });
    expect(record?.milestones.find((m) => m.id === 'm1')?.status).toBe('planned');
    expect(outcomes.end('proj_1')).toBe('decide');
  });

  it('will not let the owner sleep past an unanswered directive', async () => {
    const { actions, store, outcomes } = await setup(buildingProject({ directives: [{ id: 'dir_1', text: 'Use TypeScript.', sentAt: T0, reply: null }] }));
    expect((await actions.execute(owner, { action: 'sleep', projectId: 'proj_1' })).text).toContain('dir_1');
    expect(outcomes.end('proj_1')).toBeNull();
    await actions.execute(owner, { action: 'reply', projectId: 'proj_1', directiveId: 'dir_1', text: 'Understood.' });
    expect((await store.read('proj_1'))?.directives[0]?.reply?.text).toBe('Understood.');
    expect((await actions.execute(owner, { action: 'sleep', projectId: 'proj_1' })).ok).toBe(true);
    expect(outcomes.end('proj_1')).toBe('sleep');
  });

  it('answers a directive while a Workflow runs and leaves the Workflow running', async () => {
    const running = milestone('m1', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
    const { actions, store, services } = await setup(buildingProject({ milestones: [running], directives: [{ id: 'dir_1', text: 'Keep the hex grid.', sentAt: T0, reply: null }] }));
    const outcome = await actions.execute(owner, { action: 'reply', projectId: 'proj_1', directiveId: 'dir_1', text: 'Kept.' });
    expect(outcome.ok).toBe(true);
    const record = await store.read('proj_1');
    expect(record?.directives[0]?.reply?.text).toBe('Kept.');
    expect(record?.milestones[0]).toMatchObject({ status: 'running', dispatch: { id: 'loop_1' } });
    expect(services.dispatch).not.toHaveBeenCalled();
  });

  it('runs research through the service only while work may run', async () => {
    const { actions, services, store } = await setup();
    expect((await actions.execute(owner, { action: 'research', projectId: 'proj_1', question: 'q', stoppingCondition: 's' })).ok).toBe(true);
    expect(services.research).toHaveBeenCalledOnce();
    await store.write(buildingProject({ paused: true }));
    expect((await actions.execute(owner, { action: 'research', projectId: 'proj_1', question: 'q', stoppingCondition: 's' })).text).toContain('paused');
  });
});
