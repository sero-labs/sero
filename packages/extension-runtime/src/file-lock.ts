import { randomUUID } from 'node:crypto';
import { link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stateLockPath } from './state-lock-path';

/**
 * Cross-process exclusive lock for app state files.
 *
 * Atomic file replacement is not sufficient concurrency control: a plugin
 * extension runs in a different process from the host, so two writers can
 * each read, modify and rename without ever observing the other. The lock is
 * a directory, because directory creation, hard links and rename are the
 * atomic primitives POSIX gives us without a daemon or native code.
 *
 * The protocol keeps the lock path present while it verifies ownership:
 *
 * - **Acquire** stages a complete owner record, reserves the shared path with
 *   atomic `mkdir`, then hard-links the record into that directory without
 *   replacement. Current and legacy clients therefore compete through the
 *   same no-replace operation. A current publisher also leaves its staged
 *   owner visible until publication completes, so current reclaimers do not
 *   mistake its short ownerless phase for a crashed legacy client.
 * - **Reclaim** first moves `owner.json` to a claim file inside the lock
 *   directory. The lock path never disappears during verification, so a
 *   contender cannot acquire it. The reclaimer removes the directory only if
 *   the claimed token is the abandoned incarnation it observed. A stale
 *   claim is restored without replacing a newer owner record.
 * - **Waiters recover claims** left by a crashed reclaimer. A live owner is
 *   restored, while a dead owner is removed with its lock directory.
 * - An ownerless shared lock path is never reclaimed. A pre-0.2.2 publisher
 *   can be paused between `mkdir` and its owner write, and that state has no
 *   PID or token that can distinguish it from a crash. Waiting and timing out
 *   preserves exclusion; deleting it could admit two live holders.
 * - An ALIVE owner is never reclaimed, however long it holds the lock — a
 *   wedged holder surfaces as acquire timeouts, which is the declared
 *   failure mode. The one exception is an owner record with our own pid
 *   whose token no code in this process holds: that is a leftover of a
 *   resolved steal, and only its own process can safely say so.
 * - **Release** uses the same in-directory claim before removal, so it cannot
 *   remove a successor from a stale token observation.
 *
 * Every writer of one file must use the same lock directory, or they hold
 * two mutexes and exclude nothing. `stateLockPath` is that one name rule:
 * the host (`AppStateManager`) locks `<stateFile>.lock`, and so must every
 * extension.
 */

export interface FileLockOptions {
  /** How long to keep trying before giving up. */
  timeoutMs?: number;
  /** Age threshold for corrupt staging and interrupted-claim cleanup. */
  staleMs?: number;
  pollMs?: number;
}

const DEFAULTS = { timeoutMs: 10_000, staleMs: 30_000, pollMs: 25 };

export { stateLockPath };

interface LockOwner {
  pid: number;
  acquiredAt: number;
  token?: string;
}

/** Tokens this process currently holds; distinguishes our live locks from our leftovers. */
const heldTokens = new Set<string>();

async function readOwnerFile(file: string): Promise<LockOwner | null> {
  const raw = await readFile(file, 'utf8').catch(() => null);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const owner = parsed as Record<string, unknown>;
  if (typeof owner.pid !== 'number' || (owner.token !== undefined && typeof owner.token !== 'string')) return null;
  return { pid: owner.pid, acquiredAt: typeof owner.acquiredAt === 'number' ? owner.acquiredAt : 0, token: owner.token };
}

function readOwner(dir: string): Promise<LockOwner | null> {
  return readOwnerFile(path.join(dir, 'owner.json'));
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
  if (owner.pid === process.pid) return owner.token !== undefined && !heldTokens.has(owner.token);
  return processIsGone(owner.pid);
}

function sameOwner(left: LockOwner, right: LockOwner): boolean {
  return left.pid === right.pid
    && left.acquiredAt === right.acquiredAt
    && left.token === right.token;
}

function hasCode(error: unknown, ...codes: string[]): boolean {
  return codes.includes((error as NodeJS.ErrnoException).code ?? '');
}

async function disposeLockDir(lockDir: string): Promise<void> {
  const disposal = `${lockDir}.remove-${randomUUID()}`;
  try {
    await rename(lockDir, disposal);
  } catch (error) {
    if (hasCode(error, 'ENOENT', 'ENOTDIR')) return;
    throw error;
  }
  await rm(disposal, { recursive: true, force: true });
}

async function listSiblings(lockDir: string): Promise<string[]> {
  const parent = path.dirname(lockDir);
  const prefix = `${path.basename(lockDir)}.tmp-`;
  const entries = await readdir(parent).catch(() => [] as string[]);
  return entries.flatMap((name) => (name.startsWith(prefix) ? path.join(parent, name) : []));
}

async function listClaims(lockDir: string): Promise<string[]> {
  const entries = await readdir(lockDir).catch(() => [] as string[]);
  return entries.flatMap((name) => (
    name.startsWith('.owner-claim-') ? path.join(lockDir, name) : []
  ));
}

function claimProcessIsGone(claim: string): boolean {
  const match = path.basename(claim).match(/^\.owner-claim-(\d+)-/);
  return match ? processIsGone(Number(match[1])) : true;
}

/**
 * Remove dead staging directories and report whether a current publisher is
 * still alive. A live publisher protects the brief ownerless interval after
 * its successful mkdir.
 */
async function resolveStaging(lockDir: string, staleMs: number): Promise<boolean> {
  let livePublisher = false;
  for (const staging of await listSiblings(lockDir)) {
    const owner = await readOwner(staging);
    if (owner && !ownerIsAbandoned(owner)) {
      livePublisher = true;
      continue;
    }
    if (owner === null) {
      const stats = await stat(staging).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs < staleMs) {
        livePublisher = true;
        continue;
      }
    }
    await rm(staging, { recursive: true, force: true });
  }
  return livePublisher;
}

/** Stage a complete owner, reserve with mkdir, then publish without overwrite. */
async function tryPublish(lockDir: string, token: string): Promise<boolean> {
  const staging = `${lockDir}.tmp-${token}`;
  const stagedOwner = path.join(staging, 'owner.json');
  await mkdir(path.dirname(lockDir), { recursive: true });
  await mkdir(staging);
  const owner: LockOwner = { pid: process.pid, acquiredAt: Date.now(), token };
  await writeFile(stagedOwner, JSON.stringify(owner), 'utf8');

  try {
    await mkdir(lockDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (hasCode(error, 'EEXIST')) return false;
    throw error;
  }

  try {
    // A hard link publishes the fully-written record and never replaces a
    // successor's owner file if this reservation moved while we were paused.
    await link(stagedOwner, path.join(lockDir, 'owner.json'));
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (hasCode(error, 'ENOENT', 'EEXIST', 'ENOTDIR', 'EINVAL')) return false;
    throw error;
  }

  await rm(staging, { recursive: true, force: true });
  return (await readOwner(lockDir))?.token === token;
}

async function restoreClaim(lockDir: string, claim: string): Promise<boolean> {
  const raw = await readFile(claim, 'utf8').catch(() => null);
  if (raw === null) return false;
  try {
    await writeFile(path.join(lockDir, 'owner.json'), raw, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (!hasCode(error, 'EEXIST', 'ENOENT', 'ENOTDIR', 'EINVAL')) throw error;
    const claimedOwner = await readOwnerFile(claim);
    const currentOwner = await readOwner(lockDir);
    if (!claimedOwner || !currentOwner || !sameOwner(claimedOwner, currentOwner)) return false;
  }
  await rm(claim, { force: true });
  return true;
}

/**
 * Claim one owner record without removing the lock path. A matching claim can
 * then remove the directory without touching a successor incarnation.
 */
async function removeIfOwned(lockDir: string, expectedOwner: LockOwner | string): Promise<boolean> {
  const claim = path.join(lockDir, `.owner-claim-${process.pid}-${randomUUID()}.json`);
  try {
    await rename(path.join(lockDir, 'owner.json'), claim);
  } catch (error) {
    if (hasCode(error, 'ENOENT', 'ENOTDIR')) return false;
    throw error;
  }

  const claimedOwner = await readOwnerFile(claim);
  const matches = typeof expectedOwner === 'string'
    ? claimedOwner?.token === expectedOwner
    : claimedOwner !== null && sameOwner(claimedOwner, expectedOwner);
  if (!matches) {
    await restoreClaim(lockDir, claim);
    return false;
  }

  await disposeLockDir(lockDir);
  return true;
}

/** Restore live claims and remove locks whose claimant process has exited. */
async function resolveClaims(lockDir: string, staleMs: number): Promise<boolean> {
  for (const claim of await listClaims(lockDir)) {
    // Only the process that moved owner.json can remove this incarnation.
    // Wait while it is alive so a second resolver cannot later act on a
    // successor through the same lock path.
    if (!claimProcessIsGone(claim)) return true;
    const owner = await readOwnerFile(claim);
    const currentOwner = await readOwner(lockDir);
    if (currentOwner) {
      await rm(claim, { force: true });
      continue;
    }
    if (owner && !ownerIsAbandoned(owner)) {
      await restoreClaim(lockDir, claim);
      return true;
    }
    if (owner === null) {
      const stats = await stat(claim).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs < staleMs) return true;
    }
    await disposeLockDir(lockDir);
    return false;
  }
  return false;
}

async function releaseByToken(lockDir: string, token: string, pollMs: number): Promise<void> {
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await removeIfOwned(lockDir, token)) return;
      const ownsClaim = await Promise.all(
        (await listClaims(lockDir)).map(async (claim) => {
          const owner = await readOwnerFile(claim);
          return owner?.token === token;
        }),
      ).then((matches) => matches.some(Boolean));
      if (!ownsClaim) return;
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
    const liveClaim = await resolveClaims(lockDir, staleMs);
    if (!liveClaim) {
      const token = randomUUID();
      heldTokens.add(token);
      let published = false;
      try {
        published = await tryPublish(lockDir, token);
      } finally {
        if (!published) heldTokens.delete(token);
      }
      if (published) {
        return () => releaseByToken(lockDir, token, pollMs);
      }
      const owner = await readOwner(lockDir);
      if (owner === null) {
        // Clean only identified staging artifacts. The shared path itself can
        // be a paused legacy publisher and must remain until its owner appears.
        await resolveStaging(lockDir, staleMs);
      } else if (ownerIsAbandoned(owner)) {
        await removeIfOwned(lockDir, owner);
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
