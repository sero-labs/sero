/**
 * Waits on a managed process and on CI checks (task 5.3): an unmet condition
 * starts no owner turn however often it is read, a completion before the
 * subscription is not lost, and an outcome nobody can confirm holds the project.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppRuntimeDevServer } from '@sero-ai/common';
import type { ProjectRecord } from '../../shared/record';
import { ArchitectRuntime } from '../index';
import { createWaitReconciler } from '../wait-reconciler';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0, type FakeHost } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  return cleanupHosts();
});

const SERVER = 'ws-1:workspace:root:5173';
const server = (overrides: Partial<AppRuntimeDevServer> = {}): AppRuntimeDevServer => ({
  id: SERVER, workspaceId: 'ws-1', name: 'web', port: 5173, url: 'http://127.0.0.1:5173', command: 'pnpm dev',
  cwd: '/home/dan/projects/hollow', scope: 'workspace', status: 'running', registeredAt: T0, ...overrides,
});

async function started() {
  const host = await fakeHost();
  const store = await storeFor(host);
  const record = agreedProject({ milestones: [milestone('m1', { status: 'running' })] });
  await store.write({ ...record, session: { ...record.session, lastWakeAt: '2026-09-08T09:00:00.000Z' } });
  const runtime = new ArchitectRuntime(host, {});
  const act = (extra: Record<string, unknown>) =>
    runtime.owner?.execute({ sessionPath: host.sessions.sessionPath, cwd: '/home/dan/projects/hollow' }, { action: 'work', projectId: 'proj_1', operation: 'wait', milestoneId: 'm1', ...extra });
  const read = async () => (await runtime.records()?.read('proj_1')) as ProjectRecord;
  const turns = (text: string) => host.sessions.prompts.filter((prompt) => prompt.content.includes(text));
  const reconcile = async () => {
    await (runtime as unknown as { waits: { reconcile(id: string): Promise<void> } }).waits.reconcile('proj_1');
    await runtime.scheduler?.idle('proj_1');
  };
  return { host, store, runtime, act, read, turns, reconcile };
}

/** Lets the record store's file reads and writes finish until the condition holds; only setTimeout is faked. */
async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 2_000 && !condition(); i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function changeServer(host: FakeHost, next: AppRuntimeDevServer | null) {
  host.devServers = next ? [next] : [];
  for (const listener of host.devServerListeners) listener({ workspaceId: 'ws-1', serverId: SERVER });
}

describe('a process wait', () => {
  it('refuses a server that is not running in the workspace', async () => {
    const { host, runtime, act, read } = await started();
    try {
      await runtime.start();
      expect(await act({ source: 'process', target: SERVER })).toMatchObject({ ok: false, text: expect.stringContaining('No dev server') });
      host.devServers = [server({ status: 'stopped' })];
      expect(await act({ source: 'process', target: SERVER })).toMatchObject({ ok: false, text: expect.stringContaining('already stopped') });
      expect((await read()).waits).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });

  it('starts no turn while the server runs, and one when it exits with its code', async () => {
    const { host, runtime, act, turns, reconcile } = await started();
    try {
      await runtime.start();
      host.devServers = [server()];
      expect(await act({ source: 'process', target: SERVER })).toMatchObject({ ok: true });
      for (let i = 0; i < 3; i += 1) changeServer(host, server());
      await reconcile();
      expect(host.sessions.prompts).toHaveLength(0);
      changeServer(host, server({ status: 'failed', exit: { exitCode: 1 } }));
      changeServer(host, server({ status: 'failed', exit: { exitCode: 1 } }));
      await reconcile();
      expect(turns(`wait on process ${SERVER}`)).toHaveLength(1);
      expect(turns(`wait on process ${SERVER}`)[0].content).toMatch(/failed.*exited with code 1/s);
    } finally {
      await runtime.dispose();
    }
  });

  it('holds the project and starts nothing when the server vanished, as after a restart', async () => {
    const { host, runtime, act, read, reconcile } = await started();
    try {
      await runtime.start();
      host.devServers = [server()];
      await act({ source: 'process', target: SERVER });
      changeServer(host, null);
      await reconcile();
      expect((await read()).waits?.[0].outcome).toMatchObject({ kind: 'uncertain' });
      expect(await read()).toMatchObject({ overlay: 'blocked', blockedReason: expect.stringContaining('how it ended is unknown') });
      expect(host.sessions.prompts).toHaveLength(0);
    } finally {
      await runtime.dispose();
    }
  });
});

describe('a CI wait', () => {
  it('refuses a ref whose checks cannot be read', async () => {
    const { host, runtime, act } = await started();
    try {
      await runtime.start();
      host.checks['feat/x'] = { state: 'unknown', checks: [], reason: 'gh is not signed in' };
      expect(await act({ source: 'ci', target: 'feat/x' })).toMatchObject({ ok: false, text: expect.stringContaining('gh is not signed in') });
    } finally {
      await runtime.dispose();
    }
  });

  it('observes checks that concluded before the wait, with one turn', async () => {
    const { host, runtime, act, turns, reconcile } = await started();
    try {
      await runtime.start();
      host.checks['feat/x'] = { state: 'passed', sha: 'abc123', checks: [{ name: 'test', state: 'passed' }] };
      await act({ source: 'ci', target: 'feat/x' });
      await reconcile();
      await reconcile();
      expect(turns('wait on ci feat/x')).toHaveLength(1);
      expect(turns('wait on ci feat/x')[0].content).toContain('is satisfied');
    } finally {
      await runtime.dispose();
    }
  });

  it('reads again every two minutes while checks run, and starts no turn until they conclude', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const host = await fakeHost();
    const store = await storeFor(host);
    await store.write(agreedProject({ milestones: [milestone('m1', { status: 'running' })], waits: [{
      id: 'wait_ci', owner: { milestoneId: 'm1', executionId: null }, source: { kind: 'ci', id: 'feat/x' }, condition: 'checks-concluded',
      deadline: null, controlRevision: 0, registeredAt: T0, outcome: null, wake: null,
    }] }));
    host.checks['feat/x'] = { state: 'pending', checks: [{ name: 'test', state: 'pending' }] };
    const wakes: string[][] = [];
    const waits = createWaitReconciler({
      store, now: () => T0, log: () => undefined, readSources: async () => null,
      wake: (_id, wake) => { wakes.push(wake.items); },
      listDevServers: (workspaceId) => host.listDevServers(workspaceId),
      refChecks: (repoPath, ref) => host.refChecks(repoPath, ref),
    });
    try {
      await waits.reconcile('proj_1');
      for (const reads of [2, 3]) {
        await until(() => vi.getTimerCount() > 0);
        await vi.advanceTimersByTimeAsync(120_000);
        await until(() => host.checkReads.length === reads);
      }
      expect(host.checkReads).toHaveLength(3);
      expect(wakes).toEqual([]);
      host.checks['feat/x'] = { state: 'failed', sha: 'abc123', checks: [{ name: 'test', state: 'failed', url: 'https://ci/1' }] };
      await until(() => vi.getTimerCount() > 0);
      await vi.advanceTimersByTimeAsync(120_000);
      await until(() => wakes.length > 0);
      expect(wakes).toHaveLength(1);
      expect(wakes[0][0]).toMatch(/failed.*1 of 1 CI checks failed.*test/s);
      const reads = host.checkReads.length;
      await until(() => false);
      // The wait ended, so no read timer is armed.
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(host.checkReads.length).toBe(reads);
    } finally {
      waits.dispose();
    }
  });
});
