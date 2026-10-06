/**
 * The owner does a milestone itself (specs architect-continuous-execution,
 * architect-verification-gate, architect-owner-session).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceRecord, ProjectRecord } from '../../shared/record';
import { nextWake } from '../../shared/wake';
import { plannedWorkRemains } from '../index';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { createTurnOutcomes } from '../turn-outcomes';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };
const passed: EvidenceRecord = { commit: 'abc', fingerprint: 'fp1', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 5 }], diffSummary: '1 file', filesChanged: true, preview: null, passed: true, stale: false };

async function setup(overrides: Partial<ProjectRecord> = {}) {
  const host = await fakeHost();
  const store = await storeFor(host);
  const outcomes = createTurnOutcomes();
  let fingerprint = 'fp0';
  const services: OwnerServices = {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (record: ProjectRecord) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record) => record),
    workspaceState: vi.fn(async () => ({ commit: 'base-1', fingerprint })),
  };
  await store.write(agreedProject({ milestones: [milestone('m1', { status: 'approved' }), milestone('m2', { status: 'approved' })], ...overrides }));
  const actions = createOwnerActions({ host, store, outcomes, services });
  const work = (operation: 'begin' | 'continue' | 'report', extra: Record<string, unknown> = {}) =>
    actions.execute(owner, { action: 'work', projectId: 'proj_1', operation, ...extra });
  const m1 = async () => (await store.read('proj_1'))!.milestones[0]!;
  return { store, outcomes, services, actions, work, m1, changeFiles: (next: string) => { fingerprint = next; } };
}

async function begun(overrides: Partial<ProjectRecord> = {}) {
  const context = await setup(overrides);
  const started = await context.work('begin', { milestoneId: 'm1' });
  if (!started.ok) throw new Error(started.text);
  return { ...context, executionId: String(started.details?.executionId) };
}

describe('the owner starts a milestone itself', () => {
  it('records the execution before any work and needs no dispatch', async () => {
    const { m1, services, executionId } = await begun();
    const saved = await m1();
    expect(saved.status).toBe('running');
    expect(saved.dispatch).toBeNull();
    expect(saved.direct).toMatchObject({ id: executionId, baseCommit: 'base-1', state: 'running', placement: { mode: 'workspace', directory: '/home/dan/projects/hollow' } });
    expect(services.dispatch).not.toHaveBeenCalled();
  });

  it('gives a repeated begin the same execution', async () => {
    const { work, executionId } = await begun();
    const again = await work('begin', { milestoneId: 'm1' });
    expect(again.details?.executionId).toBe(executionId);
  });

  it('does not edit the root workspace of a Worktree project', async () => {
    const { work, m1 } = await setup({ executionMode: 'worktree' });
    const refused = await work('begin', { milestoneId: 'm1' });
    expect(refused.ok).toBe(false);
    expect((await m1()).direct).toBeUndefined();
  });

  it('starts nothing while the project is paused', async () => {
    const { work, m1 } = await setup({ paused: true });
    expect((await work('begin', { milestoneId: 'm1' })).ok).toBe(false);
    expect((await m1()).direct).toBeUndefined();
  });
});

describe('direct and delegated writers do not overlap', () => {
  it('holds a dispatch while the owner works in the folder', async () => {
    const { actions, services } = await begun();
    const result = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm2', kind: 'workflow', prompt: 'Build combat' });
    expect(result.text).toContain('folder is in use by m1');
    expect(services.dispatch).not.toHaveBeenCalled();
  });

  it('never lets a dispatch take a milestone the owner began while the dispatch was preparing', async () => {
    const { actions, services, work, store } = await setup();
    // The owner begins the same milestone while the dispatch resolves its project context.
    services.resolveDispatchProject = vi.fn(async (record: ProjectRecord) => {
      await work('begin', { milestoneId: 'm1' });
      return { projectId: record.id, runId: `run-initial-${record.id}` };
    });
    const dispatched = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Build it' }).catch((error: unknown) => error);
    expect(dispatched instanceof Error || (dispatched as { ok?: boolean }).ok === false).toBe(true);
    expect(services.dispatch).not.toHaveBeenCalled();
    const saved = (await store.read('proj_1'))!.milestones[0]!;
    expect(saved.pendingDispatch).toBeUndefined();
    expect(saved.direct).toMatchObject({ state: 'running' });
  });

  it('holds the owner while a Workflow writes the folder', async () => {
    const { work, store } = await setup({ milestones: [
      milestone('m1', { status: 'approved' }),
      milestone('m2', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } }),
    ] });
    expect((await work('begin', { milestoneId: 'm1' })).text).toContain('folder is in use by m2');
    expect((await store.read('proj_1'))?.milestones[0]?.direct).toBeUndefined();
  });
});

describe('continuing is an outcome, not progress', () => {
  it('ends the wake as continue and counts turns that changed no file', async () => {
    const { work, outcomes, m1, changeFiles } = await begun();
    outcomes.begin('proj_1');
    expect((await work('continue')).ok).toBe(true);
    expect(outcomes.end('proj_1')).toBe('continue');
    expect((await m1()).direct?.idleContinuations).toBe(1);
    expect((await m1()).status).toBe('running');
    changeFiles('fp1');
    await work('continue');
    expect((await m1()).direct?.idleContinuations).toBe(0);
  });

  it('answers a waiting directive before more autonomous work', async () => {
    const { work, store, outcomes } = await begun();
    await store.update('proj_1', (fresh) => ({ ...fresh, directives: [{ id: 'dir-1', text: 'Stop and show me', sentAt: T0, reply: null }] }));
    outcomes.begin('proj_1');
    expect((await work('continue')).ok).toBe(false);
    expect(outcomes.end('proj_1')).toBeNull();
  });

  it('delivers a directive before a queued continuation', () => {
    const next = nextWake([
      { kind: 'continue', at: T0, items: ['continue m1'] },
      { kind: 'directive', at: '2026-09-07T09:05:00.000Z', items: ['directive dir-1'] },
    ]);
    expect(next?.kind).toBe('directive');
  });

  it('counts interrupted work as work that remains, so resume wakes the owner for it', async () => {
    const { store } = await begun();
    expect(plannedWorkRemains((await store.read('proj_1'))!)).toBe(true);
  });
});

describe('a restart after a direct completion report', () => {
  it('counts a reported milestone with no evidence yet as work that remains, until evidence is in flight', async () => {
    const { work, store, executionId } = await begun({ milestones: [milestone('m1', { status: 'approved' })] });
    await work('report', { milestoneId: 'm1', executionId, text: 'Done.' });
    const reported = (await store.read('proj_1'))!;
    expect(plannedWorkRemains(reported)).toBe(true);
    expect(plannedWorkRemains({ ...reported, pendingEvidence: [{ milestoneId: 'm1' } as never] })).toBe(false);
    const withEvidence = { ...reported, milestones: reported.milestones.map((item) => (item.id === 'm1' ? { ...item, evidence: { ...passed, passed: false } } : item)) };
    expect(plannedWorkRemains(withEvidence)).toBe(false);
  });
});

describe('a completion report is a claim', () => {
  it('lets evidence run without a dispatch and refuses to close before it passes', async () => {
    const { work, actions, services, m1, executionId } = await begun();
    // Before the report the owner still holds the folder, so no check starts.
    await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['pnpm test'] });
    expect(services.evidence).not.toHaveBeenCalled();
    expect((await work('report', { executionId, text: 'Fixed it.' })).ok).toBe(true);
    expect((await m1()).status).toBe('verifying');
    expect((await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true })).text).toContain('no evidence run has happened');
    expect((await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['pnpm test'] })).ok).toBe(true);
    expect(services.evidence).toHaveBeenCalledOnce();
  });

  it('refuses a report from an execution that is not the current one', async () => {
    const { work, m1 } = await begun();
    expect((await work('report', { executionId: 'exec-old', text: 'done' })).ok).toBe(false);
    expect((await m1()).status).toBe('running');
  });

  it('does not accept on failed or stale evidence', async () => {
    const { work, actions, store, executionId } = await begun();
    await work('report', { executionId, text: 'Fixed it.' });
    for (const evidence of [{ ...passed, passed: false }, { ...passed, stale: true }]) {
      await store.update('proj_1', (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => (item.id === 'm1' ? { ...item, evidence } : item)) }));
      expect((await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true })).ok).toBe(false);
    }
  });

  it('keeps accepted and delivered apart: no receipt, no delivery', async () => {
    const { work, actions, store, m1, executionId } = await begun();
    await work('report', { executionId, text: 'Fixed it.' });
    await store.update('proj_1', (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => (item.id === 'm1' ? { ...item, evidence: passed, verification: 'verified' as const } : item)) }));
    expect((await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true })).ok).toBe(true);
    expect((await m1()).verification).toBe('accepted');
    expect((await m1()).receipt).toBeNull();
  });

  it('delivers workspace output once it is accepted, with no synthetic dispatch', async () => {
    const { work, actions, store, m1, executionId } = await begun();
    await work('report', { executionId, text: 'Fixed it.', destination: 'workspace-files' });
    expect((await m1()).verification).toBe('reported');
    await store.update('proj_1', (fresh) => ({ ...fresh, milestones: fresh.milestones.map((item) => (item.id === 'm1' ? { ...item, evidence: passed, verification: 'verified' as const } : item)) }));
    await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    const saved = await m1();
    expect(saved.verification).toBe('delivered');
    expect(saved.receipt).toBe('/home/dan/projects/hollow');
    expect(saved.dispatch).toBeNull();
  });

  it('sends a delivery outside the workspace through dispatch and its user decision', async () => {
    const { work, m1, executionId } = await begun();
    expect((await work('report', { executionId, text: 'Fixed it.', destination: 'email-send' })).ok).toBe(false);
    expect((await m1()).status).toBe('running');
  });
});
