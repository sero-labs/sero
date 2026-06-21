import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { createFakeHost } from './fake-host';

async function createLoop(coordinator: Coordinator, prompt = 'do the thing') {
  const res = await coordinator.requestAction({ kind: 'create', prompt });
  expect(res.ok).toBe(true);
  return res.loop!;
}

describe('Coordinator — Phase 1 lifecycle', () => {
  it('create stores a draft record persisted in state', async () => {
    const host = createFakeHost();
    const coordinator = new Coordinator(host);
    const loop = await createLoop(coordinator);

    expect(loop.status).toBe('draft');
    expect(loop.workspaceId).toBe('ws-1');
    expect(loop.runtime.parentSessionId).toBe(`orchestrator:ws-1:${loop.id}`);
    expect(host.state.loops).toHaveLength(1);
    expect(host.state.loops[0].id).toBe(loop.id);
  });

  it('rejects creating a loop with an empty prompt', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const res = await coordinator.requestAction({ kind: 'create', prompt: '   ' });
    expect(res.ok).toBe(false);
  });

  it('list and show read persisted state', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const loop = await createLoop(coordinator);

    const list = await coordinator.requestAction({ kind: 'list' });
    expect(list.loops).toHaveLength(1);

    const show = await coordinator.requestAction({ kind: 'show', loopId: loop.id });
    expect(show.loop?.id).toBe(loop.id);

    const missing = await coordinator.requestAction({ kind: 'show', loopId: 'nope' });
    expect(missing.ok).toBe(false);
  });

  it('activate moves draft -> active and persists', async () => {
    const host = createFakeHost();
    const coordinator = new Coordinator(host);
    const loop = await createLoop(coordinator);

    const res = await coordinator.requestAction({ kind: 'activate', loopId: loop.id });
    expect(res.ok).toBe(true);
    expect(res.loop?.status).toBe('active');
    expect(host.state.loops[0].status).toBe('active');
  });

  it('pause then resume round-trips active <-> paused', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const loop = await createLoop(coordinator);
    await coordinator.requestAction({ kind: 'activate', loopId: loop.id });

    const paused = await coordinator.requestAction({ kind: 'pause', loopId: loop.id });
    expect(paused.loop?.status).toBe('paused');

    const resumed = await coordinator.requestAction({ kind: 'resume', loopId: loop.id });
    expect(resumed.loop?.status).toBe('active');
  });

  it('rejects invalid transitions with a clear error', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const loop = await createLoop(coordinator);
    // Cannot pause a draft.
    const res = await coordinator.requestAction({ kind: 'pause', loopId: loop.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Cannot pause');
  });

  it('stop moves a loop to stopped and blocks further lifecycle', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const loop = await createLoop(coordinator);
    const stopped = await coordinator.requestAction({ kind: 'stop', loopId: loop.id });
    expect(stopped.loop?.status).toBe('stopped');

    const again = await coordinator.requestAction({ kind: 'activate', loopId: loop.id });
    expect(again.ok).toBe(false);
  });

  it('run_next requires an active loop', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const loop = await createLoop(coordinator);
    const res = await coordinator.requestAction({ kind: 'run_next', loopId: loop.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not active');
  });
});
