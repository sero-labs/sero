import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { missingEvidence } from '../owner-actions';
import { ORCHESTRATOR_REGISTRY_GLOBAL_KEY, type OrchestratorBoardAction, type OrchestratorRegistryEntryView } from '@sero-ai/common';
import { MAINTENANCE_MILESTONE_ID } from '../../shared/maintenance';
import { commitOf, createServices, evidenceIsStale, worktreeFingerprint } from '../services';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

async function setup(record = buildingProject()) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const wakes: WakeEvent[] = [];
  const services = createServices({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
  return { host, store, services, wakes };
}

/** Waits for a background evidence run to reach the condition. */
async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('the condition was never met');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function fakeCoordinator(): { actions: OrchestratorBoardAction[]; uninstall: () => void } {
  const actions: OrchestratorBoardAction[] = [];
  const registry = new Map<string, OrchestratorRegistryEntryView>([['ws-1', {
    workspaceId: 'ws-1',
    workspacePath: '/home/dan/projects/hollow',
    coordinator: { requestAction: async (action) => { actions.push(action); return { ok: true, loopId: `loop_${actions.length}` }; } },
  }]]);
  (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] = registry;
  return { actions, uninstall: () => { delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY]; } };
}

describe('runtime services', () => {
  it('uses Git empty-tree as the baseline before the first commit', async () => {
    const { host } = await setup();
    host.execResults['git rev-parse HEAD'] = { exitCode: 128, stdout: '', stderr: 'fatal: ambiguous argument HEAD' };
    expect(await commitOf(host, '/home/dan/projects/hollow')).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });

  it('creates a Workflow through the typed handle with the remaining budget and the delivery destination', async () => {
    const coordinator = fakeCoordinator();
    try {
      const { services, host } = await setup(buildingProject({ budget: { capUsd: 40, spentUsd: 10, sources: { owner: 10, research: 0, dispatched: 0 } } }));
      host.execResults['git rev-parse HEAD'] = { exitCode: 0, stdout: 'base123\n', stderr: '' };
      const link = await services.dispatch(buildingProject({ budget: { capUsd: 40, spentUsd: 10, sources: { owner: 10, research: 0, dispatched: 0 } } }), milestone('m1'), { kind: 'workflow', prompt: 'Open the PR', destination: 'pr', maxCostUsd: 100 });
      expect(link).toEqual({ id: 'loop_1', workspaceId: 'ws-1', baseCommit: 'base123' });
      expect(coordinator.actions[0]).toEqual({ kind: 'create', prompt: 'Open the PR', title: 'Milestone m1', options: { activate: true, limits: { maxCostUsd: 30 }, delivery: { destination: 'pr' } } });
    } finally {
      coordinator.uninstall();
    }
  });

  it('subscribes one maintenance Workflow to issues, CI failures and the weekly schedule, once', async () => {
    const coordinator = fakeCoordinator();
    try {
      const { services, store } = await setup(buildingProject({ phase: 'maintain' }));
      const first = await services.maintenance(buildingProject({ phase: 'maintain' }));
      expect(first.milestones.find((m) => m.id === MAINTENANCE_MILESTONE_ID)).toMatchObject({ status: 'running', dispatch: { kind: 'workflow', id: 'loop_1' } });
      expect(coordinator.actions[0]).toMatchObject({ kind: 'create', options: { activate: true, triggers: [
        { type: 'event', eventSource: 'github:issue-opened' },
        { type: 'event', eventSource: 'github:ci-failed' },
        { type: 'cron', schedule: '0 8 * * 1' },
      ] } });
      const again = await services.maintenance((await store.read('proj_1'))!);
      expect(coordinator.actions).toHaveLength(1);
      expect(again.milestones.filter((m) => m.id === MAINTENANCE_MILESTONE_ID)).toHaveLength(1);
    } finally {
      coordinator.uninstall();
    }
  });

  it('does not create maintenance while stopped or with no remaining budget', async () => {
    const coordinator = fakeCoordinator();
    try {
      const { services } = await setup();
      await expect(services.maintenance(buildingProject({ phase: 'maintain', paused: true }))).rejects.toThrow('paused');
      await expect(services.maintenance(buildingProject({
        phase: 'maintain',
        budget: { capUsd: 40, spentUsd: 40, sources: { owner: 40, research: 0, dispatched: 0 } },
      }))).rejects.toThrow('limited');
      expect(coordinator.actions).toEqual([]);
    } finally {
      coordinator.uninstall();
    }
  });

  it('runs research through the subagent seam and attaches the result before waking the owner', async () => {
    const { host, store, services, wakes } = await setup();
    const { id } = await services.research(buildingProject(), { question: 'Which engine?', stoppingCondition: 'two candidates compared' });
    expect(id).toBe('res_1');
    await waitFor(() => wakes.length > 0);
    const record = await store.read('proj_1');
    expect(record?.research[0]).toMatchObject({ id: 'res_1', question: 'Which engine?', result: 'research answer', costUsd: 0.5 });
    expect(record?.budget.sources.research).toBe(0.5);
    expect(wakes).toEqual([{ kind: 'quiet', at: T0, items: [expect.stringContaining('research res_1 finished')] }]);
    expect(host.logs).toEqual([]);
  });

  it('recovers research that was recorded before a restart', async () => {
    const pending = { id: 'res-before-restart', question: 'Which engine?', stoppingCondition: 'compare two', startedAt: T0 };
    const record = buildingProject({ pendingResearch: [pending] });
    const { store, services, wakes } = await setup(record);

    services.recoverPending(record);
    await waitFor(() => wakes.length > 0);

    expect((await store.read('proj_1'))?.research[0]?.id).toBe('res-before-restart');
    expect((await store.read('proj_1'))?.pendingResearch).toEqual([]);
  });

  it('records each command with its exit code and output, the diff summary and the commit, and fails on a non-zero exit', async () => {
    const reported = milestone('m1', {
      status: 'verifying',
      verification: 'reported',
      dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null, baseCommit: 'base000' },
    });
    const { host, store, services, wakes } = await setup(buildingProject({ milestones: [reported] }));
    host.execResults['git rev-parse HEAD'] = { exitCode: 0, stdout: 'abc123\n', stderr: '' };
    host.execResults['git diff --stat base000 -- . :(exclude).sero'] = { exitCode: 0, stdout: ' src/grid.ts | 12 ++--\n', stderr: '' };
    host.commandResults['pnpm test'] = { exitCode: 2, stdout: '', stderr: '1 failing' };
    await services.evidence(buildingProject(), milestone('m1', { status: 'verifying' }), { commands: ['pnpm typecheck', 'pnpm test'], route: null });
    await waitFor(() => wakes.length > 0);
    const evidence = (await store.read('proj_1'))?.milestones[0]?.evidence;
    expect(evidence).toMatchObject({
      commit: 'abc123',
      passed: false,
      stale: false,
      filesChanged: true,
      diffSummary: expect.stringContaining('src/grid.ts'),
      commands: [
        { command: 'pnpm typecheck', exitCode: 0, output: 'ok' },
        { command: 'pnpm test', exitCode: 2, output: '1 failing' },
      ],
    });
    expect(host.commandRuns.map((run) => run.command)).toEqual(['pnpm typecheck', 'pnpm test']);
    expect((await store.read('proj_1'))?.milestones[0]).toMatchObject({ status: 'verifying', verification: 'reported' });
    expect(wakes[0]).toMatchObject({ kind: 'dispatch-complete', items: [expect.stringContaining('failed at commit abc123: "pnpm test" exited 2')] });
  });

  it('marks passed evidence verified but never accepted, and fails a preview milestone without a dev server', async () => {
    const { store, services, wakes } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'verifying', preview: { route: '/' } })] }));
    await services.evidence(buildingProject(), milestone('m1', { status: 'verifying', preview: { route: '/' } }), { commands: ['pnpm test'], route: '/' });
    await waitFor(() => wakes.length > 0);
    const first = (await store.read('proj_1'))?.milestones[0];
    expect(first?.evidence).toMatchObject({ passed: false, preview: { route: '/', smokePassed: false, capturePath: null } });

    const plain = buildingProject({ milestones: [milestone('m1', { status: 'verifying' })] });
    await store.write(plain);
    await services.evidence(plain, plain.milestones[0]!, { commands: ['pnpm test'], route: null });
    await waitFor(() => wakes.length > 1);
    const second = (await store.read('proj_1'))?.milestones[0];
    expect(second).toMatchObject({ status: 'verifying', verification: 'verified', evidence: { passed: true, preview: null } });
  });

  it('detects tracked edits within an already dirty tree', async () => {
    const { host } = await setup();
    host.execResults['git rev-parse HEAD'] = { exitCode: 0, stdout: 'abc123\n', stderr: '' };
    host.execResults['git diff --binary abc123 -- . :(exclude).sero'] = { exitCode: 0, stdout: 'first dirty content', stderr: '' };
    const fingerprint = await worktreeFingerprint(host, '/home/dan/projects/hollow');
    const checked = milestone('m1', { evidence: {
      commit: 'abc123', fingerprint, checkedAt: T0,
      commands: [{ command: 'pnpm test', exitCode: 0, output: 'ok', durationMs: 1 }],
      diffSummary: 'src/a.ts | 1 +', filesChanged: true, preview: null, passed: true, stale: false,
    } });
    host.execResults['git diff --binary abc123 -- . :(exclude).sero'] = { exitCode: 0, stdout: 'second dirty content', stderr: '' };

    expect(await evidenceIsStale(host, buildingProject(), checked)).toBe(true);
  });

  it('rejects an HTTP error preview and always stops its managed server', async () => {
    const preview = milestone('m1', { status: 'verifying', preview: { route: '/missing' } });
    const { host, services, wakes } = await setup(buildingProject({ milestones: [preview] }));
    const server = createServer((_request, response) => { response.statusCode = 404; response.end('missing'); });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const port = (server.address() as AddressInfo).port;
    let stopped = false;
    try {
      host.detectDevServerCommand = async () => 'pnpm dev';
      host.startDevServer = async () => ({ url: `http://127.0.0.1:${port}`, serverId: 'srv-1' });
      host.stopDevServer = async () => { stopped = true; return true; };
      await services.evidence(buildingProject({ milestones: [preview] }), preview, { commands: ['pnpm test'], route: '/missing' });
      await waitFor(() => wakes.length > 0);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
    expect(stopped).toBe(true);
    expect(wakes[0]?.items[0]).toContain('preview smoke check failed');
  });

  it('records the failure and wakes the owner when the capture subagent throws', async () => {
    const preview = milestone('m1', { status: 'verifying', preview: { route: '/' } });
    const { host, store, services, wakes } = await setup(buildingProject({ milestones: [preview] }));
    // A dev server that really answers, so the run reaches the capture step.
    const server = createServer((_request, response) => { response.statusCode = 200; response.end('ok'); });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const port = (server.address() as AddressInfo).port;
    try {
      host.detectDevServerCommand = async () => 'pnpm dev';
      host.startDevServer = async () => ({ url: `http://127.0.0.1:${port}`, serverId: 'srv-1' });
      host.runStructured = async () => { throw new Error('the subagent seam is unavailable'); };
      await services.evidence(buildingProject({ milestones: [preview] }), preview, { commands: ['pnpm test'], route: '/' });
      await waitFor(() => wakes.length > 0);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
    expect(wakes[0]).toMatchObject({ kind: 'dispatch-complete', items: [expect.stringContaining('the subagent seam is unavailable')] });
    const failed = (await store.read('proj_1'))?.milestones[0];
    expect(failed).toMatchObject({ status: 'verifying', verification: 'reported' });
    expect(failed?.evidence).toMatchObject({ passed: false, commands: [{ exitCode: 1, output: expect.stringContaining('the subagent seam is unavailable') }] });
    // The failed evidence is what keeps the milestone from closing.
    expect(missingEvidence(failed!)).toContainEqual(expect.stringContaining('exit code 1'));
  });
});
