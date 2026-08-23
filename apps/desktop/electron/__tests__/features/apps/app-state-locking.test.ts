/**
 * AppStateManager cross-process locking + etag protocol (#428).
 *
 * Real filesystem in a tmpdir — the lock and the atomic writes are the unit
 * under test, so nothing here mocks fs.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withStateLock } from '@sero-ai/extension-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { AppStateManager } from '@electron/features/apps/state/manager';

let dir: string;
let manager: AppStateManager;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sero-app-state-'));
  manager = new AppStateManager();
});

afterEach(async () => {
  manager.dispose();
  await rm(dir, { recursive: true, force: true });
});

describe('etag protocol', () => {
  it('accepts a write that echoes the current etag and hands out the next one', async () => {
    const file = path.join(dir, 'state.json');
    await manager.write(file, { count: 1 });

    const first = await manager.readWithEtag(file);
    expect(first.data).toEqual({ count: 1 });
    expect(first.etag).not.toBeNull();

    const result = await manager.write(file, { count: 2 }, first.etag);
    expect(result.ok).toBe(true);
    const second = await manager.readWithEtag(file);
    expect(second.data).toEqual({ count: 2 });
    expect(second.etag).toBe(result.ok ? result.etag : null);
  });

  it('rejects a stale etag and returns the current content instead of clobbering it', async () => {
    const file = path.join(dir, 'state.json');
    await manager.write(file, { count: 1 });
    const stale = (await manager.readWithEtag(file)).etag;

    // Another writer landed in between.
    await manager.write(file, { count: 2, fromRuntime: true });

    const result = await manager.write(file, { count: 99 }, stale);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.data).toEqual({ count: 2, fromRuntime: true });
      expect(result.etag).not.toBe(stale);
    }
    expect(await manager.read(file)).toEqual({ count: 2, fromRuntime: true });
  });

  it('treats `null` as the etag of an absent file', async () => {
    const file = path.join(dir, 'state.json');
    const created = await manager.write(file, { fresh: true }, null);
    expect(created.ok).toBe(true);

    // Now the file exists, so "expect absent" must be rejected.
    const rejected = await manager.write(file, { fresh: false }, null);
    expect(rejected.ok).toBe(false);
  });

  it('writes unconditionally when no etag is passed', async () => {
    const file = path.join(dir, 'state.json');
    await manager.write(file, { a: 1 });
    const result = await manager.write(file, { a: 2 });
    expect(result.ok).toBe(true);
    expect(await manager.read(file)).toEqual({ a: 2 });
  });
});

describe('cross-process lock', () => {
  it('makes update() wait for an extension-side lock holder', async () => {
    const file = path.join(dir, 'state.json');
    await manager.write(file, { items: ['held'] });

    let updated = false;
    await withStateLock(file, async () => {
      const update = manager
        .update<{ items: string[] }>(file, (current) => ({ items: [...(current?.items ?? []), 'host'] }))
        .then(() => { updated = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(updated).toBe(false);
      void update;
    });

    await expect.poll(() => updated).toBe(true);
    expect(await manager.read(file)).toEqual({ items: ['held', 'host'] });
  });

  // The #428 defect: a host runtime and a plugin extension write one state
  // file from different processes. Every child append and the parent's last
  // status must survive; the unlocked version of this interleaving loses most
  // of the appends.
  it('loses no update between the host and an extension process', async () => {
    const file = path.join(dir, 'state.json');
    const count = 50;
    await manager.write(file, { status: 'start', items: [] });

    const worker = path.resolve(__dirname, 'fixtures/state-append-worker.mjs');
    const child = spawn(process.execPath, [worker, file, String(count)], { stdio: ['ignore', 'inherit', 'inherit'] });
    const childDone = new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
      child.on('error', reject);
    });

    // Fail fast when the worker dies before it is ready.
    await Promise.race([
      childDone,
      (async () => {
        while (!existsSync(`${file}.ready`)) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      })(),
    ]);
    await writeFile(`${file}.go`, '', 'utf8');

    type S = { status: string; items: number[] };
    for (let i = 0; i < count; i += 1) {
      await manager.update<S>(file, (current) => ({
        status: `status-${i}`,
        items: current?.items ?? [],
      }));
    }

    await childDone;
    const final = JSON.parse(await readFile(file, 'utf8')) as S;
    expect(final.items).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(final.status).toBe(`status-${count - 1}`);
  }, 30_000);
});
