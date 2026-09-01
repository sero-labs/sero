/**
 * Opening a repository's pool, and the one read-modify-write transaction every
 * lifecycle step commits through.
 *
 * Opening reconciles first: Git registration and the filesystem are read
 * before any decision, and a repository whose Git evidence cannot be read is
 * unavailable rather than empty. Each later mutation re-reads state under the
 * state lock, so a decision is always committed against the bytes on disk and
 * never against a copy this process was holding while another one wrote.
 */

import { promises as fs } from 'node:fs';

import { canonicalWorktreesRoot } from './paths';
import { listWorktreeRegistrations } from './registration';
import { reconcilePoolState } from './reconcile';
import {
  canonicalPath,
  resolveRepositoryIdentity,
  type RepositoryIdentity,
} from './repository';
import { withPoolStateLock } from './locks';
import { cleanAbandonedTempFiles, readPoolState, writePoolState } from './state-store';
import { emptyPoolState, type PoolState } from './types';

export interface PoolSession {
  identity: RepositoryIdentity;
  /** Canonical workspace path. The one spelling every later comparison uses. */
  workspacePath: string;
  /** Canonical `.sero/worktrees` root of that workspace. */
  poolRoot: string;
  /** State as reconciled when the session opened. Re-read before every write. */
  state: PoolState;
}

export type OpenPoolResult =
  | { status: 'ok'; session: PoolSession }
  | { status: 'unavailable'; reason: string };

/**
 * A mutation returns the next state plus whatever the caller needs back. It
 * runs under the state lock and must not spawn Git: the lock is a short
 * critical section, not a transaction around a subprocess.
 */
export type PoolMutation<T> = (state: PoolState) => { state?: PoolState; value: T };

export async function openPool(workspacePath: string): Promise<OpenPoolResult> {
  const identity = await resolveRepositoryIdentity(workspacePath);
  if (identity.status !== 'ok') return { status: 'unavailable', reason: identity.reason };

  // Git evidence first. A repository whose registrations cannot be listed is
  // not safe to allocate from, and must never fall back to an empty pool. The
  // timestamp is taken BEFORE the listing, so reconciliation can tell a record
  // this evidence predates from one it can speak about.
  const evidenceAt = new Date().toISOString();
  const registrations = await listWorktreeRegistrations(workspacePath);
  if (registrations.status !== 'ok') {
    return {
      status: 'unavailable',
      reason: `Could not read this repository's worktree registrations: ${registrations.reason}`,
    };
  }

  await fs.mkdir(identity.identity.poolDir, { recursive: true });
  await cleanAbandonedTempFiles(identity.identity.statePath);

  // Resolved once, then reused everywhere. A workspace reached through a
  // symlink must not look like two different workspaces to allocation and to
  // containment.
  const canonicalWorkspace = await canonicalPath(workspacePath);
  const poolRoot = await canonicalWorktreesRoot(canonicalWorkspace);

  const opened = await withPoolStateLock(identity.identity.poolDir, async () => {
    const read = await readPoolState(identity.identity.statePath);
    if (read.status === 'unavailable') return { status: 'unavailable' as const, reason: read.reason };
    const now = new Date().toISOString();
    const base = read.status === 'empty'
      ? emptyPoolState(identity.identity.repositoryId, now)
      : read.state;
    if (base.repositoryId !== identity.identity.repositoryId) {
      return {
        status: 'unavailable' as const,
        reason: 'The pool state belongs to a different repository identity.',
      };
    }
    const reconciled = await reconcilePoolState({
      state: base,
      registrations: registrations.records,
      workspacePath: canonicalWorkspace,
      poolRoot,
      evidenceAt,
      now,
    });
    if (reconciled.notes.length > 0) {
      console.log(`[worktree-pool] reconciled ${canonicalWorkspace}: ${reconciled.notes.join('; ')}`);
    }
    const state = reconciled.changed || read.status === 'empty'
      ? await writePoolState(identity.identity.statePath, reconciled.state)
      : reconciled.state;
    return { status: 'ok' as const, state };
  });

  if (opened.status === 'unavailable') return { status: 'unavailable', reason: opened.reason };
  return {
    status: 'ok',
    session: { identity: identity.identity, workspacePath: canonicalWorkspace, poolRoot, state: opened.state },
  };
}

export type CommitResult<T> =
  | { status: 'ok'; value: T; state: PoolState }
  | { status: 'unavailable'; reason: string };

/** Applies one read-modify-write against the state on disk, under the state lock. */
export async function commitPoolMutation<T>(
  identity: RepositoryIdentity,
  mutate: PoolMutation<T>,
): Promise<CommitResult<T>> {
  return withPoolStateLock(identity.poolDir, async () => {
    const read = await readPoolState(identity.statePath);
    if (read.status === 'unavailable') return { status: 'unavailable' as const, reason: read.reason };
    const current = read.status === 'empty'
      ? emptyPoolState(identity.repositoryId, new Date().toISOString())
      : read.state;
    const outcome = mutate(current);
    if (!outcome.state) return { status: 'ok' as const, value: outcome.value, state: current };
    const written = await writePoolState(identity.statePath, outcome.state);
    return { status: 'ok' as const, value: outcome.value, state: written };
  });
}
