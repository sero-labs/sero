/**
 * The owner's observable waits through the runtime and its one wake scheduler
 * (specs durable-agent-waits, architect-owner-session).
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../../shared/record';
import { reservedWakes, type WaitRegistration } from '../../shared/waits';
import { orchestratorIndexFiles } from '../dispatch-watch';
import { ArchitectRuntime } from '../index';
import { createWaitReconciler } from '../wait-reconciler';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const files = orchestratorIndexFiles('/home/dan/projects/hollow');
const loop = (status: string) => ({ id: 'loop_1', title: 'Milestone m1', status, updatedAt: T0 });
const running = () => milestone('m1', { status: 'running', dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
const open = (overrides: Partial<WaitRegistration> = {}): WaitRegistration => ({
  id: 'wait_a', owner: { milestoneId: 'm1', executionId: null }, source: { kind: 'child', id: 'loop_1' }, condition: 'completed',
  deadline: null, controlRevision: 0, registeredAt: T0, outcome: null, wake: null, ...overrides,
});

async function started(overrides: Partial<ProjectRecord> = {}, loopStatus = 'active') {
  const host = await fakeHost();
  const store = await storeFor(host);
  const record = agreedProject({ milestones: [running()], ...overrides });
  // The owner was already woken for the start approval, so only the wait can wake it.
  await store.write({ ...record, session: { ...record.session, lastWakeAt: '2026-09-08T09:00:00.000Z' } });
  host.jsonFiles[files.loops] = { loops: [loop(loopStatus)] };
  host.jsonFiles[files.rooms] = { rooms: [] };
  const runtime = new ArchitectRuntime(host, {});
  const act = (extra: Record<string, unknown>) =>
    runtime.owner?.execute({ sessionPath: host.sessions.sessionPath, cwd: '/home/dan/projects/hollow' }, { action: 'work', projectId: 'proj_1', operation: 'wait', ...extra });
  const read = async () => (await runtime.records()?.read('proj_1')) as ProjectRecord;
  const waitTurns = () => host.sessions.prompts.filter((prompt) => prompt.content.includes('wait on child loop_1'));
  // A push reaches the project through the dispatch watch's own queue.
  const push = async (file: string, state: unknown) => {
    host.jsonFiles[file] = state;
    host.emitState(file, state);
    await (runtime as unknown as { watch: { flush(): Promise<void> } }).watch.flush();
    await runtime.scheduler?.idle('proj_1');
  };
  return { host, store, runtime, act, read, waitTurns, push };
}

describe('registering a wait', () => {
  it('saves the wait on the record and counts as an explicit outcome', async () => {
    const { runtime, act, read } = await started();
    try {
      await runtime.start();
      const outcome = await act({ source: 'child', target: 'm1', deadlineMinutes: 30 });
      expect(outcome).toMatchObject({ ok: true });
      expect((await read()).waits?.[0]).toMatchObject({ source: { kind: 'child', id: 'loop_1' }, condition: 'completed', owner: { milestoneId: 'm1' }, outcome: null });
      expect((await read()).waits?.[0].deadline).not.toBeNull();
    } finally {
      await runtime.dispose();
    }
  });

  it('refuses process, CI and free text, saves nothing and promises no wake', async () => {
    const { runtime, act, read } = await started();
    try {
      await runtime.start();
      for (const source of ['process', 'ci', 'when the tests look fine']) {
        expect(await act({ source, target: 'm1' })).toMatchObject({ ok: false, text: expect.stringMatching(/Manual resume is required/) });
      }
      expect((await read()).waits).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });
});

describe('a matched wait wakes the owner once', () => {
  it('observes a completion that happened before the subscription, with one continuation', async () => {
    const { host, runtime, act, waitTurns } = await started();
    try {
      await runtime.start();
      // The source ended and its notification was never seen: only the file says so.
      host.jsonFiles[files.loops] = { loops: [loop('complete')] };
      await act({ source: 'child', target: 'm1' });
      await runtime.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(1);
      expect(waitTurns()[0].content).toContain('is satisfied');
    } finally {
      await runtime.dispose();
    }
  });

  it('gives one wake for duplicate notifications and none while the condition is unmet', async () => {
    const { runtime, act, waitTurns, read, push, host } = await started();
    try {
      await runtime.start();
      await act({ source: 'child', target: 'm1' });
      for (let i = 0; i < 3; i += 1) await push(files.loops, { loops: [loop('active')] });
      expect(host.sessions.prompts).toHaveLength(0);
      for (let i = 0; i < 3; i += 1) await push(files.loops, { loops: [loop('complete')] });
      expect(waitTurns()).toHaveLength(1);
      expect((await read()).waits?.[0]).toMatchObject({ outcome: { kind: 'satisfied' }, wake: { consumedAt: expect.any(String) } });
    } finally {
      await runtime.dispose();
    }
  });

  it('is not lost when a notification is dropped: a later push re-reads every open wait', async () => {
    const { host, runtime, act, waitTurns, push } = await started();
    try {
      await runtime.start();
      await act({ source: 'child', target: 'm1' });
      // The completion push was dropped (a full queue). Only the file changed.
      host.jsonFiles[files.loops] = { loops: [loop('complete')] };
      await push(files.rooms, { rooms: [] });
      expect(waitTurns()).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  });

  it('re-reads on restart, and a wake reserved but never started is delivered once', async () => {
    const reserved = open({ outcome: { kind: 'satisfied', at: T0, detail: 'The Workflow reported completion.' }, wake: { reservedAt: T0, consumedAt: null } });
    const { runtime, waitTurns, read } = await started({ waits: [reserved] }, 'complete');
    try {
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(1);
      expect(reservedWakes(await read())).toHaveLength(0);
    } finally {
      await runtime.dispose();
    }
    // A wake already consumed is not delivered again by a second restart.
    const again = new ArchitectRuntime((runtime as unknown as { host: never }).host, {});
    const before = waitTurns().length;
    try {
      await again.start();
      await again.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(before);
    } finally {
      await again.dispose();
    }
  });

  it('finds a completion that landed while Sero was closed', async () => {
    const { runtime, waitTurns } = await started({ waits: [open()] }, 'complete');
    try {
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  });
});

describe('user controls govern the wake', () => {
  it('keeps a match that arrives while paused, starts no turn, and delivers it once on resume', async () => {
    const { runtime, read, waitTurns, push } = await started({ paused: true, overlay: 'paused', waits: [open()] });
    try {
      await runtime.start();
      await push(files.loops, { loops: [loop('complete')] });
      expect(waitTurns()).toHaveLength(0);
      expect((await read()).waits?.[0]).toMatchObject({ outcome: { kind: 'satisfied' }, wake: null });
      const resumed = await runtime.projects?.resume('proj_1');
      expect(resumed?.ok).toBe(true);
      await runtime.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  });

  it('gives no wake after a stop, even when the source then completes', async () => {
    const { runtime, read, waitTurns, push } = await started({ waits: [open()] });
    try {
      await runtime.start();
      await runtime.projects?.stop('proj_1');
      await push(files.loops, { loops: [loop('complete')] });
      expect(waitTurns()).toHaveLength(0);
      expect((await read()).waits?.[0].outcome).toMatchObject({ kind: 'cancelled' });
    } finally {
      await runtime.dispose();
    }
  });

  it('gives no wake once the agreement authority is revoked', async () => {
    const revoked = agreedProject();
    const { runtime, waitTurns, push } = await started({ waits: [open()], agreement: revoked.agreement && { ...revoked.agreement, authority: null } });
    try {
      await runtime.start();
      await push(files.loops, { loops: [loop('complete')] });
      expect(waitTurns()).toHaveLength(0);
    } finally {
      await runtime.dispose();
    }
  });
});

describe('failed, expired and uncertain waits', () => {
  it('reports an expired wait as expired, never as completion', async () => {
    const { runtime, waitTurns } = await started({ waits: [open({ deadline: '2026-09-07T08:00:00.000Z' })] });
    try {
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(waitTurns()).toHaveLength(1);
      expect(waitTurns()[0].content).toContain('expired');
      expect(waitTurns()[0].content).toContain('not completion');
    } finally {
      await runtime.dispose();
    }
  });

  it('reports a failed source as failed', async () => {
    const { runtime, waitTurns, push } = await started({ waits: [open()] });
    try {
      await runtime.start();
      await push(files.loops, { loops: [{ ...loop('blocked'), block: { reason: 'out of budget' } }] });
      expect(waitTurns().some((prompt) => prompt.content.includes('failed') && prompt.content.includes('out of budget'))).toBe(true);
    } finally {
      await runtime.dispose();
    }
  });

  it('holds the project when a process outcome cannot be confirmed, and starts no turn', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(agreedProject({ milestones: [running()], waits: [open({ source: { kind: 'process', id: 'pid-7' }, condition: 'exited' })] }));
    const wakes: string[] = [];
    const waits = createWaitReconciler({ store, now: () => T0, wake: (_id, wake) => { wakes.push(wake.kind); }, log: () => undefined, readSources: async () => null });
    await waits.holdUncertain('proj_1', 'wait_a', 'the process could not be identified after restart');
    await waits.reconcile('proj_1');
    const record = await store.read('proj_1');
    expect(record?.waits?.[0].outcome).toMatchObject({ kind: 'uncertain' });
    expect(record).toMatchObject({ overlay: 'blocked', blockedReason: expect.stringContaining('could not confirm the outcome of process pid-7') });
    expect(wakes).toEqual([]);
  });
});
