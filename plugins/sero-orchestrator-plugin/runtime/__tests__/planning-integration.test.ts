import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { createFakeHost, type FakeHost } from './fake-host';
import {
  oneStepPlan,
  parallelPlan,
  planJson,
  sequentialPlan,
} from './fixtures';
import type { PlanningResponse } from '../../shared/types';

async function create(host: FakeHost, plan: PlanningResponse, activate = false) {
  host.modelResponses.push({ response: planJson(plan) });
  const coordinator = new Coordinator(host);
  const res = await coordinator.requestAction({
    kind: 'create',
    prompt: 'p',
    options: { activate },
  });
  return { coordinator, res };
}

describe('Coordinator — planning integration (Phase 2)', () => {
  it('materializes a cron trigger the planner derived from the description', async () => {
    const host = createFakeHost();
    const scheduled: PlanningResponse = { ...oneStepPlan(), suggestedTriggers: [{ type: 'cron', schedule: '*/10 * * * *' }] };
    host.modelResponses.push({ response: planJson(scheduled) });
    const res = await new Coordinator(host).requestAction({ kind: 'create', prompt: 'every 10 minutes, check issues' });
    const triggers = res.loop?.triggers ?? [];
    expect(triggers).toHaveLength(1);
    expect(triggers[0].type).toBe('cron');
    expect(triggers[0].schedule).toBe('*/10 * * * *');
    expect(triggers[0].nextFireAt).toBeTruthy(); // first fire time set on materialization
  });

  it('schedules a recurring loop from the dedicated extractor even when the planner emits no trigger', async () => {
    const host = createFakeHost();
    // Planner returns a plain plan with NO suggestedTriggers (the failure mode);
    // the dedicated schedule call supplies the cron.
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    host.modelResponses.push({ response: JSON.stringify({ recurring: true, schedule: '*/10 * * * *' }) });
    const res = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'every 10 minutes, check GitHub issues and open a PR',
    });
    const triggers = res.loop?.triggers ?? [];
    expect(triggers).toHaveLength(1);
    expect(triggers[0].type).toBe('cron');
    expect(triggers[0].schedule).toBe('*/10 * * * *');
    expect(triggers[0].nextFireAt).toBeTruthy();
  });

  it('leaves a one-off loop manual when the extractor says not recurring', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    host.modelResponses.push({ response: JSON.stringify({ recurring: false }) });
    const res = await new Coordinator(host).requestAction({ kind: 'create', prompt: 'fix the off-by-one bug' });
    expect(res.loop?.triggers ?? []).toHaveLength(0);
  });

  it('creates a valid one-step plan as a draft', async () => {
    const host = createFakeHost();
    const { res } = await create(host, oneStepPlan());
    expect(res.ok).toBe(true);
    expect(res.loop?.status).toBe('draft');
    expect(res.loop?.plan.steps).toHaveLength(1);
    expect(res.loop?.runtime.block).toBeUndefined();
  });

  it('creates valid sequential and parallel plans', async () => {
    expect((await create(createFakeHost(), sequentialPlan())).res.loop?.plan.steps).toHaveLength(2);
    expect((await create(createFakeHost(), parallelPlan())).res.loop?.plan.steps).toHaveLength(4);
  });

  it('stores only the extras from a planner step (default-tool names stripped)', async () => {
    const host = createFakeHost();
    const planned: PlanningResponse = {
      schemaVersion: 1,
      title: 'T',
      summary: 's',
      plan: {
        schemaVersion: 1,
        revision: 0,
        objective: 'o',
        steps: [
          { id: 's1', title: 'S1', instructions: 'i', execution: { type: 'background-agent', tools: ['bash', 'git_manager'] } },
        ],
      },
    };
    const { res } = await create(host, planned);
    const exec = res.loop?.plan.steps[0].execution;
    expect(exec && exec.type === 'background-agent' ? exec.tools : null).toEqual(['git_manager']);
  });

  it('repairs invalid model output once, then succeeds', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ garbage' });
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const coordinator = new Coordinator(host);
    const res = await coordinator.requestAction({ kind: 'create', prompt: 'p' });
    expect(res.loop?.runtime.block).toBeUndefined();
    expect(res.loop?.plan.steps).toHaveLength(1);
  });

  it('stores an unrepairable plan as a blocked draft with clear errors', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ garbage' });
    host.modelResponses.push({ response: '{ still garbage' });
    const coordinator = new Coordinator(host);
    const res = await coordinator.requestAction({ kind: 'create', prompt: 'p' });
    expect(res.loop?.status).toBe('draft');
    expect(res.loop?.runtime.block?.kind).toBe('validation-error');
    expect(res.loop?.runtime.block?.reason).toBeTruthy();
  });

  it('does not activate an invalid plan', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ garbage' });
    host.modelResponses.push({ response: '{ garbage' });
    const coordinator = new Coordinator(host);
    const created = await coordinator.requestAction({ kind: 'create', prompt: 'p' });
    const activate = await coordinator.requestAction({ kind: 'activate', loopId: created.loop!.id });
    expect(activate.ok).toBe(false);
    expect(activate.error).toContain('validation');
  });

  it('activate-on-create only happens after validation succeeds', async () => {
    const host = createFakeHost();
    const { res } = await create(host, oneStepPlan(), true);
    expect(res.loop?.status).toBe('active');
  });

  it('records a mixed-workspace-targets warning for managed worktree loops', async () => {
    const host = createFakeHost();
    const mixed: PlanningResponse = {
      schemaVersion: 1,
      title: 'Mixed',
      summary: 's',
      plan: {
        schemaVersion: 1,
        revision: 0,
        objective: 'o',
        steps: [
          { id: 'bg', title: 'bg', instructions: 'i', execution: { type: 'background-agent' } },
          {
            id: 'sess',
            title: 'sess',
            instructions: 'i',
            dependsOn: ['bg'],
            execution: {
              type: 'active-session',
              sessionTarget: {
                workspaceId: 'ws-1',
                strategy: 'most-recent-active',
                deliverAs: 'steer',
                triggerTurn: true,
              },
            },
          },
        ],
      },
    };
    const { res } = await create(host, mixed);
    expect(res.loop?.warnings.some((w) => w.code === 'mixed-workspace-targets')).toBe(true);
  });

  it('does not warn when the loop uses the workspace root', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const coordinator = new Coordinator(host);
    const res = await coordinator.requestAction({
      kind: 'create',
      prompt: 'p',
      options: { workspace: { useManagedWorktree: false } },
    });
    expect(res.loop?.warnings).toHaveLength(0);
  });
});
