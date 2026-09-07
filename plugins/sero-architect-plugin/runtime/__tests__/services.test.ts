import { afterEach, describe, expect, it } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { ORCHESTRATOR_REGISTRY_GLOBAL_KEY, type OrchestratorBoardAction, type OrchestratorRegistryEntryView } from '@sero-ai/common';
import { MAINTENANCE_MILESTONE_ID } from '../../shared/maintenance';
import { createServices } from '../services';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

async function setup(record = buildingProject()) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const wakes: WakeEvent[] = [];
  const services = createServices({ host, store, wake: (_id, wake) => { wakes.push(wake); } });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { host, store, services, wakes, flush };
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
  it('creates a Workflow through the typed handle with the remaining budget and the delivery destination', async () => {
    const coordinator = fakeCoordinator();
    try {
      const { services } = await setup(buildingProject({ budget: { capUsd: 40, spentUsd: 10, sources: { owner: 10, research: 0, dispatched: 0 } } }));
      const link = await services.dispatch(buildingProject({ budget: { capUsd: 40, spentUsd: 10, sources: { owner: 10, research: 0, dispatched: 0 } } }), milestone('m1'), { kind: 'workflow', prompt: 'Open the PR', destination: 'pr', maxCostUsd: 100 });
      expect(link).toEqual({ id: 'loop_1', workspaceId: 'ws-1' });
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

  it('runs research through the subagent seam and attaches the result before waking the owner', async () => {
    const { host, store, services, wakes, flush } = await setup();
    const { id } = await services.research(buildingProject(), { question: 'Which engine?', stoppingCondition: 'two candidates compared' });
    expect(id).toBe('res_1');
    await flush();
    const record = await store.read('proj_1');
    expect(record?.research[0]).toMatchObject({ id: 'res_1', question: 'Which engine?', result: 'research answer', costUsd: 0.5 });
    expect(record?.budget.sources.research).toBe(0.5);
    expect(wakes).toEqual([{ kind: 'quiet', at: T0, items: [expect.stringContaining('research res_1 finished')] }]);
    expect(host.logs).toEqual([]);
  });

  it('records each command with its exit code and output, the diff summary and the commit, and fails on a non-zero exit', async () => {
    const { host, store, services, wakes, flush } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'verifying', verification: 'reported' })] }));
    host.execResults['git rev-parse HEAD'] = { exitCode: 0, stdout: 'abc123\n', stderr: '' };
    host.execResults['git diff --stat HEAD'] = { exitCode: 0, stdout: ' src/grid.ts | 12 ++--\n', stderr: '' };
    host.commandResults['pnpm test'] = { exitCode: 2, stdout: '', stderr: '1 failing' };
    await services.evidence(buildingProject(), milestone('m1', { status: 'verifying' }), { commands: ['pnpm typecheck', 'pnpm test'], route: null });
    await flush();
    const evidence = (await store.read('proj_1'))?.milestones[0]?.evidence;
    expect(evidence).toMatchObject({
      commit: 'abc123',
      passed: false,
      stale: false,
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
    const { store, services, flush } = await setup(buildingProject({ milestones: [milestone('m1', { status: 'verifying', preview: { route: '/' } })] }));
    await services.evidence(buildingProject(), milestone('m1', { status: 'verifying', preview: { route: '/' } }), { commands: ['pnpm test'], route: '/' });
    await flush();
    const first = (await store.read('proj_1'))?.milestones[0];
    expect(first?.evidence).toMatchObject({ passed: false, preview: { route: '/', smokePassed: false, capturePath: null } });

    const plain = buildingProject({ milestones: [milestone('m1', { status: 'verifying' })] });
    await store.write(plain);
    await services.evidence(plain, plain.milestones[0]!, { commands: ['pnpm test'], route: null });
    await flush();
    const second = (await store.read('proj_1'))?.milestones[0];
    expect(second).toMatchObject({ status: 'verifying', verification: 'verified', evidence: { passed: true, preview: null } });
  });
});
