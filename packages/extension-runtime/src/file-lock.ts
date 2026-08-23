import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Cross-process exclusive lock for app state files.
 *
 * Atomic file replacement is not sufficient concurrency control: a plugin
 * extension runs in a different process from the host, so two writers can
 * each read, modify and rename without ever observing the other. `mkdir` is
 * atomic and fails if the directory exists, which gives us a mutex that works
 * across processes without a daemon.
 *
 * A holder that dies leaves the directory behind, so the lock records its pid
 * and acquisition time and is reclaimed once it is provably stale.
 *
 * Every writer of one file must use the same lock directory, or they hold two
 * mutexes and exclude nothing. `stateLockPath` is that one name rule: the host
 * (`AppStateManager`) locks `<stateFile>.lock`, and so must every extension.
 */

export interface FileLockOptions {
  /** How long to keep trying before giving up. */
  timeoutMs?: number;
  /** A lock older than this is treated as abandoned. */
  staleMs?: number;
  pollMs?: number;
}

const DEFAULTS = { timeoutMs: 10_000, staleMs: 30_000, pollMs: 25 };

/** The one shared lock-directory name for a state file: `<stateFile>.lock`. */
export function stateLockPath(stateFile: string): string {
  return `${stateFile}.lock`;
}

interface LockOwner {
  pid: number;
  acquiredAt: number;
}

async function readOwner(lockDir: string): Promise<LockOwner | null> {
  const raw = await readFile(path.join(lockDir, 'owner.json'), 'utf8').catch(() => null);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const owner = parsed as Record<string, unknown>;
  if (typeof owner.pid !== 'number' || typeof owner.acquiredAt !== 'number') return null;
  return { pid: owner.pid, acquiredAt: owner.acquiredAt };
}

/** True when the lock's owning process no longer exists. */
function ownerIsGone(pid: number): boolean {
  if (pid === process.pid) return false;
  try {
    // Signal 0 performs the permission/existence check without delivering.
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code !== 'EPERM';
  }
}

async function tryAcquire(lockDir: string): Promise<boolean> {
  await mkdir(path.dirname(lockDir), { recursive: true });
  const created = await mkdir(lockDir).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') return false;
      throw error;
    },
  );
  if (!created) return false;
  const owner: LockOwner = { pid: process.pid, acquiredAt: Date.now() };
  await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify(owner), 'utf8');
  return true;
}

async function reclaimIfStale(lockDir: string, staleMs: number): Promise<void> {
  const owner = await readOwner(lockDir);
  // A lock directory with no readable owner is either mid-acquisition or
  // corrupt. Give it the full stale window before assuming the latter.
  if (!owner) return;
  if (Date.now() - owner.acquiredAt < staleMs && !ownerIsGone(owner.pid)) return;
  await rm(lockDir, { recursive: true, force: true });
}

export async function acquireLock(lockDir: string, options: FileLockOptions = {}): Promise<() => Promise<void>> {
  const { timeoutMs, staleMs, pollMs } = { ...DEFAULTS, ...options };
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (await tryAcquire(lockDir)) {
      return async () => {
        await rm(lockDir, { recursive: true, force: true });
      };
    }
    await reclaimIfStale(lockDir, staleMs);
    if (Date.now() >= deadline) {
      throw new Error(`Timed out acquiring lock at ${lockDir} after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function withLock<T>(
  lockDir: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const release = await acquireLock(lockDir, options);
  try {
    return await fn();
  } finally {
    await release();
  }
}

/** Run `fn` while holding the shared cross-process lock for a state file. */
export function withStateLock<T>(
  stateFile: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  return withLock(stateLockPath(stateFile), fn, options);
}
