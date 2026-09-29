/**
 * Local event source adapters (spec 12 Phase 3): the filesystem watcher and
 * the loopback webhook listener. Real I/O — a temp directory and an ephemeral
 * 127.0.0.1 port — kept small and self-cleaning.
 *
 * Only the fs adapter's debounce runs on a fake clock: the test waits for the
 * real OS event that reaches the watcher, then closes the batch window itself,
 * instead of racing CPU load for the window (the source of issue #583).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OrchestratorEvent } from '../../shared/types';
import { createFsAdapter, isIgnoredPath } from '../events/fs-adapter';
import { createWebhookAdapter, type WebhookAdapterState } from '../events/webhook-adapter';
import { readAdapterState, writeAdapterState } from '../events/adapter-state';
import type { EventSourceAdapter, EventSubscription } from '../events/types';
import { createFakeHost, type FakeHost } from './fake-host';

/**
 * Records the real fs.watch events the adapter's listener receives, so a test
 * can wait for the OS instead of sleeping through the debounce window.
 */
const fsEvents = vi.hoisted(() => {
  let received: string[] = [];
  let waiters: Array<() => void> = [];
  return {
    reset(): void {
      received = [];
      waiters = [];
    },
    notify(filename: string | null): void {
      if (filename) received.push(filename);
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
    /** Resolves once the watcher has been handed a real event for `name`. */
    async waitFor(name: string): Promise<void> {
      while (!received.includes(name)) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
    /** Resolves once the watcher has been handed any real event. */
    async waitForAny(): Promise<void> {
      while (received.length === 0) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
});

/** Call-through wrapper: the real watcher runs, tests only observe its events. */
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const watch = ((dir: string, opts: unknown, listener: (e: string, f: string | Buffer | null) => void) =>
    actual.watch(dir, opts as never, (event, filename) => {
      listener(event, filename);
      fsEvents.notify(filename === null ? null : filename.toString());
    })) as typeof actual.watch;
  return { ...actual, watch, default: { ...actual, watch } };
});

const SUBSCRIPTION: EventSubscription = { loopId: 'loop-1', eventSource: 'fs:changed' };

function recordingEmit(): { events: OrchestratorEvent[]; emit: (e: OrchestratorEvent) => Promise<void> } {
  const events: OrchestratorEvent[] = [];
  return {
    events,
    emit: async (event) => {
      events.push(event);
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('adapter state file', () => {
  it('round-trips JSON through the artifact store and survives corrupt content', async () => {
    const host = createFakeHost();
    await writeAdapterState(host, 'webhook', { port: 4321 });
    expect(await readAdapterState<WebhookAdapterState>(host, 'webhook')).toEqual({ port: 4321 });

    host.artifacts.set('artifact://events/webhook.json', '{not json');
    expect(await readAdapterState(host, 'webhook')).toBeNull();
  });
});

describe('fs adapter', () => {
  let dir: string;
  let host: FakeHost;
  let adapter: EventSourceAdapter | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sero-fs-adapter-'));
    host = createFakeHost({ workspacePath: dir });
    fsEvents.reset();
    // Only the debounce timer is faked; Date and file I/O stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(async () => {
    adapter?.dispose();
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  it('ignores machinery paths', () => {
    expect(isIgnoredPath('.git/HEAD')).toBe(true);
    expect(isIgnoredPath('.sero/worktrees/loop-1/file.ts')).toBe(true);
    expect(isIgnoredPath('packages/node_modules/x/index.js')).toBe(true);
    expect(isIgnoredPath('docs/readme.md')).toBe(false);
  });

  it('batches changes into one debounced fs:changed event with the paths', async () => {
    const { events, emit } = recordingEmit();
    adapter = createFsAdapter(host, emit, 50);
    adapter.sync([SUBSCRIPTION]);

    await writeFile(join(dir, 'a.txt'), 'one');
    await writeFile(join(dir, 'b.txt'), 'two');
    // Wait for the real OS events; the debounce cannot close the window before
    // both changes are pending, so the batch no longer depends on CPU load.
    await fsEvents.waitFor('a.txt');
    await fsEvents.waitFor('b.txt');
    await vi.advanceTimersByTimeAsync(50);

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('fs:changed');
    const paths = events[0].payload.paths as string[];
    expect(paths).toEqual(['a.txt', 'b.txt']);
    expect(events[0].payload.count).toBe(paths.length);
  });

  it('never fires for ignored directories', async () => {
    const { events, emit } = recordingEmit();
    adapter = createFsAdapter(host, emit, 50);
    adapter.sync([SUBSCRIPTION]);

    await mkdir(join(dir, '.git'), { recursive: true });
    await writeFile(join(dir, '.git', 'HEAD'), 'ref');
    await fsEvents.waitForAny();
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toEqual([]);
  });

  it('stops watching when the last subscriber goes away', async () => {
    const { events, emit } = recordingEmit();
    adapter = createFsAdapter(host, emit, 50);
    adapter.sync([SUBSCRIPTION]);
    adapter.sync([]);

    await writeFile(join(dir, 'after-stop.txt'), 'x');
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toEqual([]);
    expect(host.logs.some((l) => l.includes('stopped'))).toBe(true);
  });
});

describe('webhook adapter', () => {
  let host: FakeHost;
  let adapter: EventSourceAdapter | undefined;

  const port = async (): Promise<number> => {
    await waitFor(() => host.logs.some((l) => l.includes('listening on 127.0.0.1:')));
    const line = host.logs.find((l) => l.includes('listening on 127.0.0.1:'))!;
    return Number(line.split(':').at(-1));
  };

  beforeEach(() => {
    host = createFakeHost();
  });

  afterEach(() => {
    adapter?.dispose();
  });

  it('routes POST /hooks/<name> to webhook:<name> with the JSON body as payload', async () => {
    const { events, emit } = recordingEmit();
    adapter = createWebhookAdapter(host, emit);
    adapter.sync([{ loopId: 'loop-1', eventSource: 'webhook:deploy' }]);
    const p = await port();

    const response = await fetch(`http://127.0.0.1:${p}/hooks/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: '1.2.3' }),
    });
    expect(response.status).toBe(202);
    await waitFor(() => events.length > 0);
    expect(events[0].source).toBe('webhook:deploy');
    expect(events[0].payload).toEqual({ version: '1.2.3' });

    // The actual port is persisted so hook URLs stay stable across restarts.
    expect((await readAdapterState<WebhookAdapterState>(host, 'webhook'))?.port).toBe(p);

    const missing = await fetch(`http://127.0.0.1:${p}/other`, { method: 'POST' });
    expect(missing.status).toBe(404);
  });

  it('rejects a bad secret and accepts the right one', async () => {
    await writeAdapterState<WebhookAdapterState>(host, 'webhook', { port: 0, secrets: { deploy: 's3cret' } });
    const { events, emit } = recordingEmit();
    adapter = createWebhookAdapter(host, emit);
    adapter.sync([{ loopId: 'loop-1', eventSource: 'webhook:deploy' }]);
    const p = await port();

    const denied = await fetch(`http://127.0.0.1:${p}/hooks/deploy`, { method: 'POST', body: '{}' });
    expect(denied.status).toBe(401);
    expect(events).toEqual([]);

    const allowed = await fetch(`http://127.0.0.1:${p}/hooks/deploy`, {
      method: 'POST',
      headers: { 'x-sero-secret': 's3cret' },
      body: '{}',
    });
    expect(allowed.status).toBe(202);
    await waitFor(() => events.length === 1);
  });

  it('closes the listener when the last subscriber goes away', async () => {
    const { emit } = recordingEmit();
    adapter = createWebhookAdapter(host, emit);
    adapter.sync([{ loopId: 'loop-1', eventSource: 'webhook:deploy' }]);
    const p = await port();

    adapter.sync([]);
    await expect(fetch(`http://127.0.0.1:${p}/hooks/deploy`, { method: 'POST', body: '{}' })).rejects.toThrow();
  });
});
