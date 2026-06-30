import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, planJson } from './fixtures';

function setup(): { host: FakeHost; coordinator: Coordinator } {
  const host = createFakeHost();
  return { host, coordinator: new Coordinator(host) };
}

async function createLoop(host: FakeHost, coordinator: Coordinator, prompt = 'do the thing') {
  host.modelResponses.push({ response: planJson(oneStepPlan()) });
  const res = await coordinator.requestAction({ kind: 'create', prompt });
  expect(res.ok).toBe(true);
  return res.loop!;
}

describe('Coordinator — Phase 1 lifecycle', () => {
  it('create stores a draft record persisted in state', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);

    expect(loop.status).toBe('draft');
    expect(loop.workspaceId).toBe('ws-1');
    expect(loop.runtime.parentSessionId).toBe(`orchestrator:ws-1:${loop.id}`);
    expect(loop.plan.steps).toHaveLength(1);
    expect(Object.keys(loop.runtime.stepStates)).toEqual(['step-1']);
    expect(host.state.loops).toHaveLength(1);
    expect(host.state.loops[0].id).toBe(loop.id);
  });

  it('rejects creating a loop with an empty prompt', async () => {
    const { coordinator } = setup();
    const res = await coordinator.requestAction({ kind: 'create', prompt: '   ' });
    expect(res.ok).toBe(false);
  });

  it('list and show read persisted state', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);

    const list = await coordinator.requestAction({ kind: 'list' });
    expect(list.loops).toHaveLength(1);

    const show = await coordinator.requestAction({ kind: 'show', loopId: loop.id });
    expect(show.loop?.id).toBe(loop.id);

    const missing = await coordinator.requestAction({ kind: 'show', loopId: 'nope' });
    expect(missing.ok).toBe(false);
  });

  it('activate moves draft -> active and persists', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);

    const res = await coordinator.requestAction({ kind: 'activate', loopId: loop.id });
    expect(res.ok).toBe(true);
    expect(res.loop?.status).toBe('active');
    expect(host.state.loops[0].status).toBe('active');
  });

  it('disable then enable round-trips active <-> disabled', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);
    await coordinator.requestAction({ kind: 'activate', loopId: loop.id });

    const disabled = await coordinator.requestAction({ kind: 'disable', loopId: loop.id });
    expect(disabled.loop?.status).toBe('disabled');

    const enabled = await coordinator.requestAction({ kind: 'enable', loopId: loop.id });
    expect(enabled.loop?.status).toBe('active');
  });

  it('rejects invalid transitions with a clear error', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);
    // Cannot enable a draft — only a disabled or blocked loop can be enabled.
    const res = await coordinator.requestAction({ kind: 'enable', loopId: loop.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Cannot enable');
  });

  it('disable is reversible — an off loop can be enabled again (not terminal)', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);
    await coordinator.requestAction({ kind: 'activate', loopId: loop.id });
    const disabled = await coordinator.requestAction({ kind: 'disable', loopId: loop.id });
    expect(disabled.loop?.status).toBe('disabled');
    expect(disabled.loop?.runtime.activeRunId).toBeUndefined();

    const again = await coordinator.requestAction({ kind: 'enable', loopId: loop.id });
    expect(again.ok).toBe(true);
    expect(again.loop?.status).toBe('active');
  });

  it('run_next requires an active loop', async () => {
    const { host, coordinator } = setup();
    const loop = await createLoop(host, coordinator);
    const res = await coordinator.requestAction({ kind: 'run_next', loopId: loop.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not active');
  });
});
