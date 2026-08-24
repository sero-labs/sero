import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stateLockPath } from './state-lock-path';

/**
 * Cross-process exclusive lock for app state files.
 *
 * Atomic file replacement is not sufficient concurrency control: a plugin
 * extension runs in a different process from the host, so two writers can
 * each read, modify and rename without ever observing the other. The lock is
 * a directory, because directory creation and rename are the atomic
 * primitives POSIX gives us without a daemon or native code.
 *
 * The protocol is built so that no step ever removes a lock based on a
 * possibly-stale observation:
 *
 * - **Acquire** stages a directory that already contains `owner.json` and
 *   publishes it with one atomic `rename` onto the lock path. The lock can
 *   therefore never exist without its owner file, so there is no window in
 *   which a half-made lock can be reclaimed and then resurrected by a late
 *   owner write.
 * - **Reclaim** of an abandoned lock (owner process dead, or an ownerless
 *   legacy directory past `staleMs`) starts with an atomic `rename` of the
 *   lock to a unique grave path. Only one contender can win that rename. The
 *   winner then re-reads the grave: if it holds the incarnation that was
 *   judged abandoned it is removed; if a live successor was moved by mistake
 *   (the judgement was stale) it is renamed back, never deleted.
 * - **Acquirers verify after publishing**: if any grave holds a live owner, a
 *   displaced holder may still be inside its critical section, so the new
 *   acquirer withdraws and waits. Every waiter also restores live graves and
 *   clears dead ones, so a crashed reclaimer cannot strand the lock.
 * - An ALIVE owner is never reclaimed, however long it holds the lock — a
 *   wedged holder surfaces as acquire timeouts, which is the declared
 *   failure mode. The one exception is an owner record with our own pid
 *   whose token no code in this process holds: that is a leftover of a
 *   resolved steal, and only its own process can safely say so.
 * - **Release** verifies the ownership token before removing anything, and
 *   also looks for its own lock in a grave, so a holder that was briefly
 *   moved aside still cleans up after itself.
 *
 * Every writer of one file must use the same lock directory, or they hold
 * two mutexes and exclude nothing. `stateLockPath` is that one name rule:
 * the host (`AppStateManager`) locks `<stateFile>.lock`, and so must every
 * extension.
 */

export interface FileLockOptions {
  /** How long to keep trying before giving up. */
  timeoutMs?: number;
  /** An ownerless lock directory older than this is treated as abandoned. */
  staleMs?: number;
  pollMs?: number;
}

const DEFAULTS = { timeoutMs: 10_000, staleMs: 30_000, pollMs: 25 };

export { stateLockPath };

interface LockOwner {
  pid: number;
  acquiredAt: number;
  token: string;
}

/** Tokens this process currently holds; distinguishes our live locks from our leftovers. */
const heldTokens = new Set<string>();

async function readOwner(dir: string): Promise<LockOwner | null> {
  const raw = await readFile(path.join(dir, 'owner.json'), 'utf8').catch(() => null);
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
function processIsGone(pid: number): boolean {
  try {
    // Signal 0 performs the permission/existence check without delivering.
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code !== 'EPERM';
  }
}

function ownerIsAbandoned(owner: LockOwner): boolean {
  if (owner.pid === process.pid) return !heldTokens.has(owner.token);
  return processIsGone(owner.pid);
}

function isTakenCode(code: string | undefined): boolean {
  // rename onto a non-empty directory: ENOTEMPTY on most platforms, EEXIST on some.
  return code === 'ENOTEMPTY' || code === 'EEXIST';
}

/**
 * Rename that refuses to replace an existing target. `rename` silently
 * replaces an EMPTY target directory, and the lock path can hold an empty
 * directory while a legacy (pre-0.2.2) client is between its `mkdir` and its
 * owner write — that incarnation must be waited out, not clobbered.
 */
async function renameIfAbsent(src: string, dst: string): Promise<boolean> {
  const existing = await stat(dst).catch(() => null);
  if (existing) return false;
  try {
    await rename(src, dst);
    return true;
  } catch (error) {
    // ENOENT: the source vanished under a concurrent resolver — equally "no".
    const code = (error as NodeJS.ErrnoException).code;
    if (isTakenCode(code) || code === 'ENOENT') return false;
    throw error;
  }
}

/** Stage a fully-populated lock directory, then publish it atomically. */
async function tryPublish(lockDir: string, token: string): Promise<boolean> {
  const staging = `${lockDir}.tmp-${token}`;
  await mkdir(path.dirname(lockDir), { recursive: true });
  await mkdir(staging);
  const owner: LockOwner = { pid: process.pid, acquiredAt: Date.now(), token };
  await writeFile(path.join(staging, 'owner.json'), JSON.stringify(owner), 'utf8');
  const published = await renameIfAbsent(staging, lockDir);
  if (!published) await rm(staging, { recursive: true, force: true });
  return published;
}

async function listSiblings(lockDir: string, kind: 'grave' | 'tmp'): Promise<string[]> {
  const parent = path.dirname(lockDir);
  const prefix = `${path.basename(lockDir)}.${kind}-`;
  const entries = await readdir(parent).catch(() => [] as string[]);
  return entries.filter((name) => name.startsWith(prefix)).map((name) => path.join(parent, name));
}

/**
 * Restore or clear graves and abandoned staging dirs. Returns true while any
 * grave holds a live owner — an acquirer must not enter until it is restored.
 */
async function resolveGraves(lockDir: string, staleMs: number): Promise<boolean> {
  let liveGrave = false;
  for (const grave of await listSiblings(lockDir, 'grave')) {
    const owner = await readOwner(grave);
    if (owner && !ownerIsAbandoned(owner)) {
      liveGrave = true;
      // A live holder was moved aside by a stale reclaim: put it back. The
      // rename is atomic, so concurrent restorers cannot duplicate it, and a
      // failure (lock path occupied) just leaves the grave for the next pass.
      await renameIfAbsent(grave, lockDir);
      continue;
    }
    if (owner === null) {
      // Graves are created fully-populated, so an ownerless one is corrupt;
      // give it the stale window before clearing it.
      const stats = await stat(grave).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs < staleMs) continue;
    }
    await rm(grave, { recursive: true, force: true });
  }
  for (const staging of await listSiblings(lockDir, 'tmp')) {
    // A staging dir belongs to one live acquire attempt; clear it once its
    // process is gone or, lacking an owner record, once it is stale.
    const owner = await readOwner(staging);
    const abandoned = owner
      ? ownerIsAbandoned(owner)
      : await stat(staging).then((s) => Date.now() - s.mtimeMs >= staleMs, () => false);
    if (abandoned) await rm(staging, { recursive: true, force: true });
  }
  return liveGrave;
}

/**
 * Reclaim what was observed as an abandoned lock. The rename decides a single
 * winner; the verify afterwards guarantees a live successor moved by a stale
 * observation is restored, never deleted.
 */
async function reclaimViaGrave(lockDir: string, observedToken: string | null): Promise<void> {
  const grave = `${lockDir}.grave-${randomUUID()}`;
  try {
    await rename(lockDir, grave);
  } catch {
    return; // Someone else already reclaimed this incarnation.
  }
  const owner = await readOwner(grave);
  const sameIncarnation = observedToken === null ? owner === null : owner?.token === observedToken;
  if (sameIncarnation) {
    await rm(grave, { recursive: true, force: true });
    return;
  }
  // The observation was stale and we moved a different incarnation. Restore
  // it; if the lock path is already occupied again, resolveGraves finishes
  // the restore on a later pass.
  await renameIfAbsent(grave, lockDir);
}

async function releaseByToken(lockDir: string, token: string, pollMs: number): Promise<void> {
  try {
    // A steal-and-restore can move our lock through a grave while we release,
    // so check both places and try again briefly if it is mid-flight.
    for (let attempt = 0; attempt < 40; attempt++) {
      const owner = await readOwner(lockDir);
      if (owner?.token === token) {
        await rm(lockDir, { recursive: true, force: true });
        return;
      }
      let foundOurs = false;
      for (const grave of await listSiblings(lockDir, 'grave')) {
        if ((await readOwner(grave))?.token === token) {
          foundOurs = true;
          await rm(grave, { recursive: true, force: true });
        }
      }
      if (!foundOurs) return; // Nothing of ours anywhere: legitimately reclaimed.
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    heldTokens.delete(token);
  }
}

export async function acquireLock(lockDir: string, options: FileLockOptions = {}): Promise<() => Promise<void>> {
  const { timeoutMs, staleMs, pollMs } = { ...DEFAULTS, ...options };
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const liveGrave = await resolveGraves(lockDir, staleMs);
    if (!liveGrave) {
      const token = randomUUID();
      heldTokens.add(token);
      let published = false;
      try {
        published = await tryPublish(lockDir, token);
      } finally {
        if (!published) heldTokens.delete(token);
      }
      if (published) {
        // Verify: a displaced live holder may still be running inside a
        // grave. Withdraw and wait for it to be restored.
        if (!(await resolveGraves(lockDir, staleMs))) {
          return () => releaseByToken(lockDir, token, pollMs);
        }
        await releaseByToken(lockDir, token, pollMs);
      } else {
        const owner = await readOwner(lockDir);
        if (owner === null) {
          // No owner record: either a rename is mid-flight or a legacy client
          // crashed between mkdir and its owner write. Judge by age.
          const stats = await stat(lockDir).catch(() => null);
          if (stats && Date.now() - stats.mtimeMs >= staleMs) {
            await reclaimViaGrave(lockDir, null);
          }
        } else if (ownerIsAbandoned(owner)) {
          await reclaimViaGrave(lockDir, owner.token);
        }
      }
    }
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
