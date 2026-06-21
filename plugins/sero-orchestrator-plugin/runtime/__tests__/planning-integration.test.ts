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
