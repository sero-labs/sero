import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
 * Reclaim rules, in order of proof:
 * - An owner whose process has exited is reclaimed immediately.
 * - A directory that never got a readable owner file (a crash between mkdir
 *   and the owner write) is reclaimed once the directory is `staleMs` old.
 * - An ALIVE owner is never reclaimed, however long it holds the lock —
 *   evicting a live holder breaks mutual exclusion, because that holder will
 *   finish its write and then release a lock that now belongs to someone
 *   else. A wedged holder therefore surfaces as acquire timeouts, which is
 *   the declared failure mode.
 *
 * Release verifies an ownership token before removing anything, so a release
 * arriving after a legitimate reclaim (owner died mid-hold and its release
 * closure still ran, e.g. in a finally) cannot remove a successor's lock.
 *
 * Every writer of one file must use the same lock directory, or they hold two
 * mutexes and exclude nothing. `stateLockPath` is that one name rule: the host
 * (`AppStateManager`) locks `<stateFile>.lock`, and so must every extension.
 */

export interface FileLockOptions {
  /** How long to keep trying before giving up. */
  timeoutMs?: number;
  /** An ownerless lock directory older than this is treated as abandoned. */
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
  token: string;
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
  if (typeof owner.pid !== 'number' || typeof owner.token !== 'string') return null;
  return { pid: owner.pid, acquiredAt: typeof owner.acquiredAt === 'number' ? owner.acquiredAt : 0, token: owner.token };
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

/** Returns the ownership token on success, null when the lock is taken. */
async function tryAcquire(lockDir: string): Promise<string | null> {
  await mkdir(path.dirname(lockDir), { recursive: true });
  const created = await mkdir(lockDir).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') return false;
      throw error;
    },
  );
  if (!created) return null;
  const owner: LockOwner = { pid: process.pid, acquiredAt: Date.now(), token: randomUUID() };
  try {
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify(owner), 'utf8');
  } catch (error) {
    // The directory was reclaimed as ownerless between the mkdir and this
    // write — the lock is not ours, go back to waiting.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return owner.token;
}

async function reclaimIfAbandoned(lockDir: string, staleMs: number): Promise<void> {
  const owner = await readOwner(lockDir);
  if (owner) {
    // An alive owner is never reclaimed; see the module comment.
    if (!ownerIsGone(owner.pid)) return;
    await rm(lockDir, { recursive: true, force: true });
    return;
  }
  // No readable owner: mid-acquisition, or a crash before the owner write.
  // Judge by the directory's age and give it the full stale window.
  const stats = await stat(lockDir).catch(() => null);
  if (!stats) return;
  if (Date.now() - stats.mtimeMs < staleMs) return;
  await rm(lockDir, { recursive: true, force: true });
}

export async function acquireLock(lockDir: string, options: FileLockOptions = {}): Promise<() => Promise<void>> {
  const { timeoutMs, staleMs, pollMs } = { ...DEFAULTS, ...options };
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const token = await tryAcquire(lockDir);
    if (token !== null) {
      return async () => {
        // Remove only what is still ours — releasing after a reclaim must
        // not take a successor's lock with it.
        const owner = await readOwner(lockDir);
        if (owner?.token !== token) return;
        await rm(lockDir, { recursive: true, force: true });
      };
    }
    await reclaimIfAbandoned(lockDir, staleMs);
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
