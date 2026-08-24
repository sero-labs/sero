import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, stateLockPath, withLock, withStateLock } from '../file-lock';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sero-file-lock-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('withLock', () => {
  it('excludes a second holder until the first releases', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    const order: string[] = [];

    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withLock(lockDir, async () => {
      order.push('first-in');
      await firstHolds;
      order.push('first-out');
    });
    // Give the first writer time to take the lock before the second tries.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = withLock(lockDir, async () => {
      order.push('second-in');
    });

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-in', 'first-out', 'second-in']);
  });

  it('reclaims a lock whose owner is gone', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    await mkdir(lockDir);
    // A pid from a process that has already exited.
    const gonePid = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      child.on('exit', () => resolve(child.pid!));
      child.on('error', reject);
    });
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: gonePid, acquiredAt: Date.now(), token: 'gone' }), 'utf8');

    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });

  // Evicting a live holder breaks mutual exclusion: the evicted holder would
  // finish, then release a lock that belongs to its successor. A wedged but
  // alive owner therefore surfaces as timeouts, never as a reclaim.
  it('never reclaims an alive owner, however old the lock is', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    await mkdir(lockDir);
    // Not our own pid — pid 1 is always alive.
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: 1, acquiredAt: Date.now() - 60_000, token: 'held' }), 'utf8');

    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 300, staleMs: 100 })).rejects.toThrow(/Timed out/);
  });

  it('never reclaims a live tokenless legacy owner', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    await mkdir(lockDir);
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({
      pid: process.pid,
      acquiredAt: Date.now() - 60_000,
    }), 'utf8');

    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 300, staleMs: 100 })).rejects.toThrow(/Timed out/);

    // Version 0.2.1 released unconditionally after its critical section.
    await rm(lockDir, { recursive: true, force: true });
    const release = await acquireLock(lockDir, { timeoutMs: 2000 });
    await release();
  });

  it('never reclaims an ownerless legacy reservation', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    // A paused legacy publisher and a crashed one have the same empty shape.
    await mkdir(lockDir);

    const contender = withLock(lockDir, async () => 'ran', { timeoutMs: 300, staleMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({
      pid: process.pid,
      acquiredAt: Date.now(),
    }), 'utf8');
    await expect(contender).rejects.toThrow(/Timed out/);

    await rm(lockDir, { recursive: true, force: true });
    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });

  it('does not release a lock it no longer owns', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    const release = await acquireLock(lockDir);
    // The holder dies and a successor legitimately reclaims and reacquires.
    await rm(lockDir, { recursive: true, force: true });
    await mkdir(lockDir);
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: 1, acquiredAt: Date.now(), token: 'successor' }), 'utf8');

    // The stale release closure must leave the successor's lock alone.
    await release();
    const owner = JSON.parse(await readFile(path.join(lockDir, 'owner.json'), 'utf8')) as { token: string };
    expect(owner.token).toBe('successor');
  });

  it('restores a live owner record left by an interrupted reclaim', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    const release = await acquireLock(lockDir);
    const claim = path.join(lockDir, '.owner-claim-interrupted.json');
    await rename(path.join(lockDir, 'owner.json'), claim);

    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 200 })).rejects.toThrow(/Timed out/);
    await expect(readFile(path.join(lockDir, 'owner.json'), 'utf8')).resolves.toContain(`"pid":${process.pid}`);

    await release();
    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });

  it('removes an interrupted reclaim whose owner is gone', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    await mkdir(lockDir);
    const gonePid = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      child.on('exit', () => resolve(child.pid!));
      child.on('error', reject);
    });
    await writeFile(path.join(lockDir, '.owner-claim-interrupted.json'), JSON.stringify({
      pid: gonePid,
      acquiredAt: Date.now(),
      token: 'gone-claim',
    }), 'utf8');

    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });

  it('throws on timeout while another holder is alive', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    const release = await acquireLock(lockDir);
    // The holder is this process, which is alive, so it is never reclaimed.
    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 200 })).rejects.toThrow(/Timed out acquiring lock/);
    await release();
  });

  it('releases the lock when the task throws', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    await expect(withLock(lockDir, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withLock(lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });
});

describe('stateLockPath', () => {
  it('derives the shared lock directory from the state file path', () => {
    expect(stateLockPath('/a/b/state.json')).toBe('/a/b/state.json.lock');
  });
});

describe('cross-process exclusion', () => {
  // Two writers in separate processes must not lose an update. The child
  // appends items in a loop while this process rewrites status; every append
  // and the last status must survive. This is the defect #428 exists for:
  // without the shared lock, interleaved read-modify-write cycles routinely
  // erase each other's writes.
  it('loses no update between a parent and a child writer', async () => {
    const stateFile = path.join(dir, 'state.json');
    const count = 50;
    await writeFile(stateFile, JSON.stringify({ status: 'start', items: [] }), 'utf8');

    const worker = fileURLToPath(new URL('./fixtures/append-worker.ts', import.meta.url));
    // --import tsx: the fixture and file-lock use extensionless TS imports,
    // which plain Node type-stripping cannot resolve.
    const child = spawn(process.execPath, ['--import', 'tsx', worker, stateFile, String(count)], { stdio: ['ignore', 'inherit', 'inherit'] });
    const childDone = new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
      child.on('error', reject);
    });

    // Start barrier: without it the parent finishes all its writes before the
    // child process has even booted, and the test proves nothing. The unlocked
    // version of this interleaving loses most of the 50 appends.
    while (!existsSync(`${stateFile}.ready`)) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await writeFile(`${stateFile}.go`, '', 'utf8');

    for (let i = 0; i < count; i += 1) {
      await withStateLock(stateFile, async () => {
        const current = JSON.parse(await readFile(stateFile, 'utf8')) as { status: string; items: number[] };
        current.status = `status-${i}`;
        await writeFile(stateFile, JSON.stringify(current), 'utf8');
      });
    }

    await childDone;
    const final = JSON.parse(await readFile(stateFile, 'utf8')) as { status: string; items: number[] };
    expect(final.items).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(final.status).toBe(`status-${count - 1}`);
  }, 30_000);

  // The abandoned-lock races: current and legacy publishers contend while
  // many processes observe the same dead holder and more holders crash
  // mid-storm. Each worker proves exclusion with a marker file inside its
  // critical section.
  // LOCK_STRESS_WORKERS / LOCK_STRESS_SECTIONS scale it up for manual runs.
  it('keeps exclusion while holders crash and many contenders reclaim at once', async () => {
    const lockDir = path.join(dir, 'state.json.lock');
    const logFile = path.join(dir, 'stress.log');
    await writeFile(logFile, '', 'utf8');

    // Start from an already-crashed holder so every contender's first move is
    // to reclaim the same dead lock.
    const gonePid = await new Promise<number>((resolve, reject) => {
      const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      dead.on('exit', () => resolve(dead.pid!));
      dead.on('error', reject);
    });
    await mkdir(lockDir);
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: gonePid, acquiredAt: Date.now(), token: 'crashed' }), 'utf8');

    const workers = Number(process.env.LOCK_STRESS_WORKERS ?? 8);
    const sections = Number(process.env.LOCK_STRESS_SECTIONS ?? 5);
    const fixture = fileURLToPath(new URL('./fixtures/contender-worker.ts', import.meta.url));
    const ids: string[] = [];
    const runs = [] as Promise<void>[];
    const start = (id: string, mode: 'normal' | 'legacy' | 'crash') => {
      ids.push(id);
      const child = spawn(process.execPath, ['--import', 'tsx', fixture, lockDir, logFile, id, String(sections), mode], { stdio: ['ignore', 'inherit', 'inherit'] });
      runs.push(new Promise<void>((resolve, reject) => {
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${id} exited ${code}`))));
        child.on('error', reject);
      }));
    };
    for (let w = 0; w < workers; w += 1) start(`w${w}`, 'normal');
    const legacyWorkers = 2;
    for (let w = 0; w < legacyWorkers; w += 1) start(`legacy-${w}`, 'legacy');
    start('crash-a', 'crash');
    start('crash-b', 'crash');

    while (!ids.every((id) => existsSync(`${logFile}.ready-${id}`))) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await writeFile(`${logFile}.go`, '', 'utf8');
    await Promise.all(runs);

    const log = await readFile(logFile, 'utf8');
    expect(log).not.toContain('OVERLAP');
    expect(log.split('\n').filter((line) => line.startsWith('OK ')).length).toBe((workers + legacyWorkers) * sections);
  }, 120_000);
});
