/**
 * The pool's two lock domains.
 *
 * One lock held across a whole acquisition would serialise every network
 * fetch behind every other repository operation, so the work is split:
 *
 *  1. The **state lock** guards each read-modify-write of `pool.json`. It is
 *     held for a short critical section only — validate, choose, record the
 *     transition, unlock — never across a Git subprocess.
 *  2. The **Git-mutation gate** serialises the commands that change worktree
 *     registration: `worktree add`, `remove`, `repair` and `prune`. Fetches
 *     and other read-only Git work stay outside it and may overlap.
 *
 * Both are the same cross-process protocol the rest of Sero already uses, so a
 * plugin extension process and the host compete for the same lock rather than
 * holding two mutexes that exclude nothing. A timeout is a named failure: a
 * live holder is never reclaimed.
 */

import path from 'node:path';

import { withLock } from '@sero-ai/extension-runtime';

/** A short critical section: validate, decide, record, unlock. */
const STATE_LOCK_TIMEOUT_MS = 15_000;
/**
 * `git worktree add` clones nothing but does check out a tree, which on a
 * large repository is seconds rather than milliseconds. The gate therefore
 * waits longer than the state lock.
 */
const GIT_GATE_TIMEOUT_MS = 120_000;

export class PoolLockTimeoutError extends Error {
  constructor(readonly domain: 'pool-state' | 'git-mutation', cause: unknown) {
    super(`Timed out waiting for the ${domain} lock: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'PoolLockTimeoutError';
  }
}

function stateLockDir(poolDir: string): string {
  return path.join(poolDir, 'pool.json.lock');
}

function gitGateLockDir(poolDir: string): string {
  return path.join(poolDir, 'git-mutation.lock');
}

export async function withPoolStateLock<T>(poolDir: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withLock(stateLockDir(poolDir), fn, { timeoutMs: STATE_LOCK_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Timed out acquiring lock')) {
      throw new PoolLockTimeoutError('pool-state', error);
    }
    throw error;
  }
}

export async function withGitMutationGate<T>(poolDir: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withLock(gitGateLockDir(poolDir), fn, { timeoutMs: GIT_GATE_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Timed out acquiring lock')) {
      throw new PoolLockTimeoutError('git-mutation', error);
    }
    throw error;
  }
}
