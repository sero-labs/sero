/**
 * Serialisation primitive for the plugin's authoritative writes.
 *
 * Two layers, because there are two kinds of concurrent writer:
 *
 * - An in-process queue per path. Extension tools and the background runtime
 *   both run inside the Sero main process, so this is what actually orders
 *   almost every write.
 * - An exclusive lock directory. A Pi CLI session is a separate process, and
 *   `mkdir` with an existing name fails atomically on every supported
 *   filesystem, which gives a cross-process mutex with no dependency.
 *
 * A read-modify-write inside `withFileLock` cannot interleave, so no writer
 * can lose an update.
 */

import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** A lock older than this is treated as abandoned by a crashed process. */
const STALE_LOCK_MS = 30_000;
const RETRY_DELAY_MS = 8;
const MAX_WAIT_MS = 10_000;

const inProcess = new Map<string, Promise<unknown>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function acquireDirectoryLock(lockPath: string): Promise<void> {
  const startedAt = Date.now();

  for (;;) {
    try {
      await mkdir(lockPath);
      return;
    } catch {
      const held = await stat(lockPath).catch(() => null);
      if (held && Date.now() - held.mtimeMs > STALE_LOCK_MS) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error(`Timed out waiting for the Design Library lock at ${lockPath}.`);
      }
      await delay(RETRY_DELAY_MS);
    }
  }
}

/** Run `work` with exclusive access to `filePath`. */
export async function withFileLock<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const previous = inProcess.get(filePath) ?? Promise.resolve();

  const current = previous.then(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const lockPath = `${filePath}.lock`;
    await acquireDirectoryLock(lockPath);
    try {
      return await work();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  });

  // Keep the chain alive even when this caller's work rejects.
  const chained = current.catch(() => undefined);
  inProcess.set(filePath, chained);
  try {
    return await current;
  } finally {
    if (inProcess.get(filePath) === chained) inProcess.delete(filePath);
  }
}
