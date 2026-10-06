/**
 * The owner's own work across turns, a cap and a restart, through the runtime
 * and its one wake scheduler (specs architect-owner-session,
 * architect-continuous-execution).
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { DirectExecution } from '../../shared/direct-execution';
import type { ProjectRecord } from '../../shared/record';
import { ArchitectRuntime } from '../index';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0, type FakeHost } from './helpers';

afterEach(cleanupHosts);

const execution: DirectExecution = {
  id: 'exec-1', runId: null, owner: { subject: 'owner', sessionId: 'sess-1', sessionPath: '/sessions/owner.jsonl' },
  placement: { mode: 'workspace', directory: '/home/dan/projects/hollow', workspaceId: 'ws-1' },
  baseCommit: 'base-1', baseFingerprint: 'fp0', requirementRevision: null, state: 'running', startedAt: T0,
  claim: null, continuations: 0, idleContinuations: 0, lastFingerprint: 'fp0',
};

async function started(overrides: Partial<ProjectRecord> = {}) {
  const host: FakeHost = await fakeHost();
  const store = await storeFor(host);
  const record = agreedProject({ milestones: [milestone('m1', { status: 'running', direct: execution })], ...overrides });
  // The owner was already woken for the start approval, so a restart does not
  // deliver it again and the only reason to wake is the work itself.
  await store.write({ ...record, session: { ...record.session, lastWakeAt: '2026-09-08T09:00:00.000Z' } });
  const runtime = new ArchitectRuntime(host, {});
  const act = (action: 'work' | 'sleep', extra: Record<string, unknown> = {}) =>
    runtime.owner?.execute({ sessionPath: host.sessions.sessionPath, cwd: '/home/dan/projects/hollow' }, { action, projectId: 'proj_1', ...extra });
  const direct = async () => (await runtime.records()?.read('proj_1'))?.milestones[0]?.direct;
  return { host, runtime, act, direct };
}

describe('the owner continues its own work', () => {
  it('keeps the work after a restart, wakes the owner for it, and continues in the same session', async () => {
    const { host, runtime, act, direct } = await started();
    try {
      // The first turn asks for another; every later one stops.
      host.sessions.onTurn = async () => {
        await act(host.sessions.prompts.length === 1 ? 'work' : 'sleep', { operation: 'continue' });
      };
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(host.sessions.prompts[0]?.content).toContain('interrupted');
      expect(host.sessions.prompts[1]?.content).toContain('continue milestone m1');
      // One session did every turn: nothing opened a second driver.
      expect(new Set(host.sessions.prompts.map((prompt) => prompt.handleId)).size).toBe(1);
      expect(await direct()).toMatchObject({ id: 'exec-1', state: 'running', continuations: 1 });
    } finally {
      await runtime.dispose();
    }
  });

  it('marks the work interrupted on a paused project and starts no turn', async () => {
    const { host, runtime, direct } = await started({ paused: true });
    try {
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(host.sessions.prompts).toHaveLength(0);
      expect(await direct()).toMatchObject({ id: 'exec-1', state: 'interrupted' });
    } finally {
      await runtime.dispose();
    }
  });

  it('does not continue once the cap is reached', async () => {
    const { host, runtime, act } = await started();
    try {
      // The turn costs more than the $5 cap, then asks to continue.
      host.sessions.costUsd = 9;
      host.sessions.onTurn = async () => { await act('work', { operation: 'continue' }); };
      await runtime.start();
      await runtime.scheduler?.idle('proj_1');
      expect(host.sessions.prompts).toHaveLength(1);
      expect((await runtime.records()?.read('proj_1'))?.overlay).toBe('limited');
    } finally {
      await runtime.dispose();
    }
  });
});
