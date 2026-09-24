import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { WakeEvent } from '../../shared/wake';
import { openRun } from '../../shared/runs';
import { createDispatchWatch, loopRunsIndexFile, orchestratorIndexFiles } from '../dispatch-watch';
import { createOwnerActions, type OwnerServices } from '../owner-actions';
import { createRunJournal, type JournalRecord } from '../run-journal';
import { createTurnOutcomes } from '../turn-outcomes';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const files = orchestratorIndexFiles('/home/dan/projects/hollow');
const running = (kind: 'workflow' | 'room', id: string) => milestone('m1', { status: 'running', dispatch: { kind, id, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });

async function setup(record = buildingProject({ milestones: [running('workflow', 'loop_1')] })) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const wakes: WakeEvent[] = [];
  const loops = record.milestones.filter((item) => item.dispatch?.kind === 'workflow').map((item) => ({
    id: item.dispatch?.id ?? '', title: item.title, status: 'active', updatedAt: T0,
    ...(item.id === 'maintenance' ? { lastRunAt: '2026-09-08T08:00:00.000Z' } : {}),
  }));
  const rooms = record.milestones.filter((item) => item.dispatch?.kind === 'room').map((item) => ({
    id: item.dispatch?.id ?? '', title: item.title, status: 'running', memberCount: 1, activeMemberCount: 1,
    costUsd: 0, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null,
  }));
  host.jsonFiles[files.loops] = { version: 1, loops };
  host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms };
  const openMaintenanceRun = vi.fn(async (_projectId: string, _objectiveId: string) => undefined);
  const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); }, openMaintenanceRun });
  await watch.track(record);
  const settle = () => watch.flush();
  return { host, store, watch, wakes, settle, openMaintenanceRun };
}

describe('dispatch watch', () => {
  it('exposes time-limit recovery and clears it when the saved workflow resumes', async () => {
    const { host, store, watch, settle } = await setup();
    host.emitState(files.loops, { loops: [{ id: 'loop_1', title: 'UI', status: 'blocked', block: { limit: 'maxWallClockMs', reason: 'reached max wall-clock (1800000ms)' }, usage: { costUsd: 2 } }] });
    await settle();
    const record = await store.read('proj_1');
    expect(record).toMatchObject({ overlay: 'blocked' });
    expect(record?.milestones[0].dispatch).toMatchObject({ id: 'loop_1', chargedUsd: 2, failure: 'reached max wall-clock (1800000ms)' });
    // The reason is not filed as the Architect's own report: that fold holds
    // what the Architect said, and it said nothing about this stop.
    expect(record?.stateLine).not.toBe('reached max wall-clock (1800000ms)');
    expect(record?.milestones[0].dispatch?.costLimitUsd).toBeUndefined();

    host.emitState(files.loops, { loops: [{ id: 'loop_1', title: 'UI', status: 'active', usage: { costUsd: 2 } }] });
    host.emitState(loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1'), { runs: [{ id: 'run_resumed', status: 'running', startedAt: T0 }] });
    await settle();
    const resumed = await store.read('proj_1');
    expect(resumed?.blockedReason).toBeNull();
    expect(resumed?.milestones[0].dispatch).toMatchObject({ id: 'loop_1', chargedUsd: 2 });
    expect(resumed?.milestones[0].dispatch?.failure).toBeUndefined();
    // The resumed entry names the milestone and folds the reason it stopped.
    const entry = resumed?.history.find((item) => item.cause === 'Workflow resumed');
    expect(entry?.subject).toEqual({ kind: 'workflow', id: 'loop_1', label: 'Milestone m1' });
    expect(entry?.detail).toBe('reached max wall-clock (1800000ms)');
    watch.dispose();
  });

  it('names the PLAN position of the step a restart interrupted, not its place in the run', async () => {
    const { host, store, watch, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, {
      runs: [{
        id: 'run_1',
        status: 'orphaned',
        startedAt: T0,
        // The plan's third step, and only the second activation: a run that
        // skipped a step lists them out of plan order, so the position in this
        // array is NOT the number the page shows.
        steps: [
          { stepId: 'choose', status: 'completed', planIndex: 0 },
          { stepId: 'right', status: 'orphaned', planIndex: 2 },
        ],
        interruptedStepIds: ['right'],
      }],
    });
    await settle();
    const record = await store.read('proj_1');
    expect(record?.milestones[0]?.dispatch?.failure).toBe('Sero restarted during step 3 of its Workflow.');
    // The interrupted step is still the one the recovery offers.
    expect(record?.milestones[0]?.dispatch?.retryStepId).toBe('right');
    watch.dispose();
  });

  it('states no step number when the run recorded no plan position', async () => {
    const { host, store, watch, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, {
      runs: [{
        id: 'run_1',
        status: 'orphaned',
        startedAt: T0,
        steps: [{ stepId: 's1', status: 'orphaned' }],
        interruptedStepIds: ['s1'],
      }],
    });
    await settle();
    // Without a plan position there is no honest number, so none is given.
    expect((await store.read('proj_1'))?.milestones[0]?.dispatch?.failure)
      .toBe('Sero restarted while its Workflow was mid-step.');
    watch.dispose();
  });

  it('states no step number when a restart left more than one step in flight', async () => {
    const { host, store, watch, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, {
      runs: [{
        id: 'run_1',
        status: 'orphaned',
        startedAt: T0,
        steps: [{ stepId: 's1', status: 'orphaned' }, { stepId: 's2', status: 'orphaned' }],
        interruptedStepIds: ['s1', 's2'],
      }],
    });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0]?.dispatch?.failure)
      .toBe('Sero restarted with 2 steps in flight.');
    watch.dispose();
  });

  it('reports an exhausted Workflow cap with its actual reason and preserves live charges', async () => {
    const { host, store, watch, wakes, settle } = await setup();
    host.emitState(files.loops, { loops: [{ id: 'loop_1', title: 'CLI', status: 'blocked', maxCostUsd: 1.2, block: { limit: 'maxCostUsd', reason: 'reached max cost ($1.2)' }, usage: { costUsd: 1.21 } }] });
    host.emitState(loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1'), { runs: [{ id: 'run_1', status: 'blocked', startedAt: T0,
      steps: [{ stepId: 'release', status: 'completed', outcomeStatus: 'blocked' }],
    }] });
    await settle();
    const record = await store.read('proj_1');
    // The run's own reason, not a paraphrase of it.
    expect(record?.milestones[0].dispatch).toMatchObject({ costLimitUsd: 1.2, chargedUsd: 1.21, failure: 'reached max cost ($1.2)' });
    expect(record?.blockedReason).toBe('reached max cost ($1.2)');
    expect(wakes.some((wake) => wake.items.some((item) => item.includes('reached max cost ($1.2)')))).toBe(true);
    watch.dispose();
  });

  it('records completed workspace delivery without accepting unverified work and recovers an accepted release', async () => {
    const release = milestone('m1', { status: 'verifying', verification: 'reported',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'workspace-files' } });
    const { host, store, watch, settle } = await setup(buildingProject({ phase: 'release', milestones: [release] }));
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, { runs: [{ id: 'run_1', status: 'running' }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0]?.receipt).toBeNull();
    host.emitState(file, { runs: [{ id: 'run_1', status: 'completed' }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ receipt: '/home/dan/projects/hollow', verification: 'reported' });
    expect((await store.read('proj_1'))?.phase).toBe('release');
    watch.dispose();
    // A previously accepted local release from before this fix recovers when
    // the watcher reads the durable run index during startup.
    await store.write(buildingProject({ phase: 'release', milestones: [{ ...release, status: 'done', verification: 'accepted' }] }));
    host.jsonFiles[file] = { runs: [{ id: 'run_1', status: 'completed' }] };
    const recovered = createDispatchWatch({ host, store, wake: vi.fn() });
    await recovered.track((await store.read('proj_1'))!);
    await recovered.flush();
    expect((await store.read('proj_1'))?.milestones[0]?.verification).toBe('delivered');
    expect((await store.read('proj_1'))?.phase).toBe('maintain');
    recovered.dispose();
  });

  it('shows an interrupted execution even when the workflow remains active, then clears it on retry', async () => {
    const { host, store, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, { runs: [{ id: 'run_1', status: 'orphaned', startedAt: T0 }] });
    await settle();
    const failed = await store.read('proj_1');
    // The run kept no cause (it has no block and no interrupted step), and the
    // record says exactly that instead of inventing one.
    expect(failed?.milestones[0]?.dispatch?.failure).toBe('The Workflow stopped. No cause was recorded.');
    expect(failed?.blockedReason).toBe('The Workflow stopped. No cause was recorded.');
    host.emitState(file, { runs: [
      { id: 'run_1', status: 'orphaned', startedAt: T0 },
      { id: 'run_2', status: 'running', startedAt: '2026-09-09T00:00:00.000Z' },
    ] });
    await settle();
    const retried = await store.read('proj_1');
    expect(retried?.blockedReason).toBeNull();
    expect(retried?.milestones[0]?.dispatch?.failure).toBeUndefined();
  });

  it('offers the blocked step for retry when a completed worker reports a blocker', async () => {
    const { host, store, watch, settle } = await setup();
    const file = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(file, { runs: [{ id: 'run_1', status: 'blocked', startedAt: T0, steps: [
      { stepId: 'checks', status: 'completed', outcomeStatus: 'succeeded' },
      { stepId: 'release', status: 'completed', outcomeStatus: 'blocked' },
    ] }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0].dispatch).toMatchObject({
      id: 'loop_1', retryStepId: 'release', failure: 'The Workflow stopped. No cause was recorded.',
    });
    expect((await store.read('proj_1'))?.overlay).toBe('blocked');

    host.emitState(file, { runs: [{ id: 'run_2', status: 'running', startedAt: '2026-09-09T00:00:00.000Z' }] });
    await settle();
    const resumed = await store.read('proj_1');
    expect(resumed?.blockedReason).toBeNull();
    expect(resumed?.milestones[0].dispatch?.retryStepId).toBeUndefined();
    watch.dispose();
  });

  it('moves a completed Workflow to verifying, never done, and wakes the owner', async () => {
    const { host, store, wakes, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0 }] });
    await settle();
    expect(wakes).toEqual([]);
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'complete', updatedAt: T0, usage: { costUsd: 3 } }] });
    await settle();
    const record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'reported' });
    expect(record?.budget.sources.dispatched).toBe(3);
    expect(record?.milestones[0]?.dispatch?.chargedUsd).toBe(3);
    expect(wakes).toEqual([{ kind: 'dispatch-complete', at: T0, items: ['milestone m1 (Workflow loop_1 "Grid") reported completion; it is a claim until evidence passes'] }]);
  });

  it('charges only the usage delta and wakes once for a question', async () => {
    const { host, store, wakes, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 2 }, pendingInput: 1 }] });
    await settle();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 5 }, pendingInput: 1 }] });
    await settle();
    expect((await store.read('proj_1'))?.budget.sources.dispatched).toBe(5);
    expect(wakes.map((w) => w.kind)).toEqual(['dispatch-blocked']);
  });

  it('journals the delegated total as aggregate coverage next to the budget charge', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    const opened = openRun(buildingProject({ milestones: [running('workflow', 'loop_1')] }), { id: 'run-1', kind: 'initial' }, T0);
    if (!opened.ok) throw new Error(opened.error);
    await store.write(opened.record);
    host.jsonFiles[files.loops] = { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0 }] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };

    const watch = createDispatchWatch({ host, store, wake: () => undefined, journal });
    await watch.track(opened.record);
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 2 } }] });
    await watch.flush();

    // The budget took the delegated total...
    expect((await store.read('proj_1'))?.budget.sources.dispatched).toBeCloseTo(2);
    // ...and the trace holds the same figure, labelled as a total without call
    // detail rather than as a measured per-call amount.
    const lines = fs.readFileSync(path.join(homeDir, 'runs', 'proj_1', 'run-1.journal.ndjson'), 'utf8')
      .split('\n').filter(Boolean).map((line) => JSON.parse(line) as JournalRecord);
    const usage = lines.filter((line) => line.kind === 'usage');
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costUsd).toBeCloseTo(2);
    expect(usage[0]?.coverage).toBe('aggregate');
    expect(usage[0]?.source).toBe('dispatch:workflow:loop_1');
  });

  it('journals the rise in a Workflow\'s working time, with or without a cost rise, once', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    const opened = openRun(buildingProject({ milestones: [running('workflow', 'loop_1')] }), { id: 'run-1', kind: 'initial' }, T0);
    if (!opened.ok) throw new Error(opened.error);
    await store.write(opened.record);
    host.jsonFiles[files.loops] = { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0 }] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };
    const watch = createDispatchWatch({ host, store, wake: () => undefined, journal });
    await watch.track(opened.record);
    const report = async (costUsd: number, durationMs: number) => {
      host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd, durationMs } }] });
      await watch.flush();
    };
    await report(2, 600_000);
    await report(2, 900_000);
    await report(2, 900_000);

    const usage = fs.readFileSync(path.join(homeDir, 'runs', 'proj_1', 'run-1.journal.ndjson'), 'utf8')
      .split('\n').filter(Boolean).map((line) => JSON.parse(line) as JournalRecord).filter((line) => line.kind === 'usage');
    expect(usage.map((line) => [line.costUsd, line.activeMs])).toEqual([[2, 600_000], [0, 300_000]]);
    // Time alone never charges the budget.
    expect((await store.read('proj_1'))?.budget.sources.dispatched).toBeCloseTo(2);
  });

  it('holds running work when restart cannot confirm its dispatch record', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [running('workflow', 'missing-loop')] });
    await store.write(record);
    host.jsonFiles[files.loops] = { version: 1, loops: [] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };
    const watch = createDispatchWatch({ host, store, wake: () => undefined });

    await watch.track(record);

    expect((await store.read('proj_1'))?.blockedReason).toContain('missing-loop');
  });

  it('holds a project when restart finds a dispatch intent without a saved link', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [milestone('m1', {
      status: 'approved',
      pendingDispatch: { kind: 'workflow', destination: null, startedAt: T0 },
    })] });
    await store.write(record);
    host.jsonFiles[files.loops] = { version: 1, loops: [] };
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [] };
    const watch = createDispatchWatch({ host, store, wake: () => undefined });

    await watch.track(record);

    expect((await store.read('proj_1'))?.blockedReason).toContain('m1 started at');
  });

  it('reads the index once on track, so a completion missed while closed is not lost', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [running('room', 'room_1')] });
    await store.write(record);
    host.jsonFiles[files.rooms] = { schemaVersion: 1, rooms: [{ id: 'room_1', title: 'Team', status: 'completed', memberCount: 2, activeMemberCount: 0, costUsd: 4, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0, deliveredAt: null, deliveryRef: null }] };
    const wakes: WakeEvent[] = [];
    const watch = createDispatchWatch({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
    await watch.track(record);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('verifying');
    expect(wakes.map((w) => w.kind)).toEqual(['dispatch-complete']);
  });

  it('reads an existing Room delivery receipt from the watched summary', async () => {
    const release = milestone('m1', {
      status: 'verifying',
      verification: 'verified',
      dispatch: { kind: 'room', id: 'room_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' },
      evidence: { commit: 'abc123', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, filesChanged: false, preview: null, passed: true, stale: false },
    });
    const { host, store, wakes, settle } = await setup(buildingProject({ phase: 'release', milestones: [release] }));
    host.emitState(files.rooms, { schemaVersion: 1, rooms: [{
      id: 'room_1', title: 'Release room', status: 'completed', memberCount: 2, activeMemberCount: 0,
      costUsd: 2, maxCostUsd: 10, startedAt: T0, updatedAt: T0, attentionCount: 0,
      deliveredAt: T0, deliveryRef: 'https://github.com/x/y/pull/8',
    }] });
    await settle();

    expect((await store.read('proj_1'))?.milestones[0]?.receipt).toBe('https://github.com/x/y/pull/8');
    expect(wakes.some((wake) => wake.items.some((item) => item.includes('delivery receipt')))).toBe(true);
  });

  it('holds a receipt as delivery evidence until the owner accepts, then delivers and starts maintain', async () => {
    // The real order: the run delivers first, and the owner accepts afterwards.
    const releaseMilestone = milestone('m1', {
      status: 'verifying',
      verification: 'verified',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' },
      evidence: { commit: 'abc123', checkedAt: T0, commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, filesChanged: false, preview: null, passed: true, stale: false },
    });
    const { host, store, wakes, settle } = await setup(buildingProject({ phase: 'release', milestones: [releaseMilestone] }));
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Release', status: 'active', updatedAt: T0 }] });
    await settle();
    const runs = loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1');
    host.emitState(runs, { version: 1, runs: [{ id: 'run_1', status: 'completed', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/7', summary: 'PR opened', deliveredAt: T0 } }] });
    await settle();
    let record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'verified', receipt: 'https://github.com/x/y/pull/7' });
    expect(record?.phase).toBe('release');
    expect(wakes.at(-1)?.items[0]).toContain('stays verifying');

    // The owner accepts the milestone on its passed evidence.
    const services: OwnerServices = {
      research: vi.fn(async () => ({ id: 'res_1' })),
      resolveDispatchProject: vi.fn(async (record) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
      dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
      evidence: vi.fn(async () => undefined),
      recoverPending: vi.fn(),
      restartResearch: vi.fn(),
      evidenceIsStale: vi.fn(async () => false),
      maintenance: vi.fn(async (r) => r),
    };
    const actions = createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services });
    const outcome = await actions.execute(
      { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' },
      { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true },
    );
    expect(outcome.ok).toBe(true);
    expect(services.maintenance).toHaveBeenCalledOnce();
    record = await store.read('proj_1');
    expect(record?.milestones[0]).toMatchObject({ status: 'done', verification: 'delivered' });
    expect(record?.phase).toBe('maintain');
    expect(record?.history.at(-1)?.cause).toContain('release delivered at https://github.com/x/y/pull/7');
  });

  it('uses the receipt from the latest Workflow run', async () => {
    const release = milestone('m1', {
      status: 'verifying',
      verification: 'verified',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: 'pr' },
    });
    const { host, store, settle } = await setup(buildingProject({ phase: 'release', milestones: [release] }));
    host.emitState(loopRunsIndexFile('/home/dan/projects/hollow', 'loop_1'), { runs: [
      { id: 'run_old', status: 'completed', startedAt: '2026-09-08T08:00:00.000Z', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/6', summary: 'old', deliveredAt: T0 } },
      { id: 'run_new', status: 'completed', startedAt: '2026-09-09T08:00:00.000Z', delivery: { destination: 'pr', ref: 'https://github.com/x/y/pull/7', summary: 'new', deliveredAt: T0 } },
    ] });
    await settle();

    expect((await store.read('proj_1'))?.milestones[0]?.receipt).toBe('https://github.com/x/y/pull/7');
  });

  it('wakes the owner with an external event when the maintenance Workflow runs again', async () => {
    const maintenance = milestone('maintenance', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_m', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
    const { host, store, wakes, settle, openMaintenanceRun } = await setup(buildingProject({ phase: 'maintain', milestones: [maintenance] }));
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-08T08:00:00.000Z' }] });
    await settle();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-09T08:00:00.000Z' }] });
    await settle();
    expect(wakes.map((w) => w.kind)).toEqual(['external-event']);
    expect((await store.read('proj_1'))?.milestones[0]?.status).toBe('running');
    // The objective's run opens before the owner's first model call, keyed by
    // the maintenance run that fired, so a repeat never opens a second run.
    expect(openMaintenanceRun).toHaveBeenCalledWith('proj_1', 'loop_m:2026-09-09T08:00:00.000Z');
  });

  it('stamps the maintenance dispatch with its last run and next scheduled fire', async () => {
    const maintenance = milestone('maintenance', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_m', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
    const { host, store, settle } = await setup(buildingProject({ phase: 'maintain', milestones: [maintenance] }));
    host.emitState(files.loops, { version: 1, loops: [{
      id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-14T19:46:17.412Z',
      schedules: [{ triggerId: 't1', type: 'cron', schedule: '0 8 * * 1', nextFireAt: '2026-09-21T08:00:00.000Z', lastFireAt: '2026-09-14T19:46:17.298Z' }],
    }] });
    await settle();
    const dispatch = (await store.read('proj_1'))?.milestones[0]?.dispatch;
    expect(dispatch).toMatchObject({ lastRunAt: '2026-09-14T19:46:17.412Z', nextRunAt: '2026-09-21T08:00:00.000Z' });
    host.emitState(files.loops, { version: 1, loops: [{
      id: 'loop_m', title: 'maintenance', status: 'active', updatedAt: T0, lastRunAt: '2026-09-14T19:46:17.412Z', schedules: [],
    }] });
    await settle();
    const unscheduled = (await store.read('proj_1'))?.milestones[0]?.dispatch;
    expect(unscheduled?.nextRunAt).toBeUndefined();
    expect(unscheduled?.lastRunAt).toBe('2026-09-14T19:46:17.412Z');
  });

  it('takes the limited overlay when dispatched usage reaches the cap, without touching the phase', async () => {
    const { host, store, settle } = await setup();
    host.emitState(files.loops, { version: 1, loops: [{ id: 'loop_1', title: 'Grid', status: 'active', updatedAt: T0, usage: { costUsd: 45 } }] });
    await settle();
    const record = await store.read('proj_1');
    expect(record?.overlay).toBe('limited');
    expect(record?.phase).toBe('build');
    expect(record?.milestones[0]?.status).toBe('running');
    expect(record?.history.at(-1)?.cause).toBe('reached the $40 cost cap');
  });
});

describe('observed liveness', () => {
  it('stamps a dispatch only while the watched index marks its run live in this session', async () => {
    const { host, store, watch, settle } = await setup();
    const reportedNow = new Date().toISOString();

    host.emitState(files.loops, {
      loops: [{
        id: 'loop_1',
        title: 'UI',
        status: 'active',
        liveRun: { runId: 'run_1', startedAt: reportedNow, reportedAt: reportedNow },
        usage: { costUsd: 1 },
      }],
    });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0].dispatch?.observedLiveAt).toBeDefined();

    // The run ends: the mark goes, and so does the stamp.
    host.emitState(files.loops, { loops: [{ id: 'loop_1', title: 'UI', status: 'active', usage: { costUsd: 1 } }] });
    await settle();
    expect((await store.read('proj_1'))?.milestones[0].dispatch?.observedLiveAt).toBeUndefined();
    watch.dispose();
  });

  it('ignores a live mark left by an earlier session', async () => {
    const { host, store, watch, settle } = await setup();

    host.emitState(files.loops, {
      loops: [{
        id: 'loop_1',
        title: 'UI',
        status: 'active',
        liveRun: { runId: 'run_old', startedAt: T0, reportedAt: T0 },
        usage: { costUsd: 1 },
      }],
    });
    await settle();

    expect((await store.read('proj_1'))?.milestones[0].dispatch?.observedLiveAt).toBeUndefined();
    watch.dispose();
  });
});
