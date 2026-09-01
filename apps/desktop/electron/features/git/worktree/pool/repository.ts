/**
 * Repository identity for the worktree pool.
 *
 * `workspacePath` is not a repository identity. Two Sero workspace
 * registrations can point at the same clone, and a worktree of that clone is a
 * third path over the same object store. Allocating from two pools over one
 * repository would give two lock domains and exclude nothing, so identity is
 * the canonical Git common directory.
 *
 * The pool state and both lock domains live beside that common directory, so
 * every workspace registration of one repository shares a single authority
 * without needing an index to agree on. Physical slots stay under the
 * workspace's own `.sero/worktrees/`, and each slot records which workspace
 * owns its directory.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { execWorktreeGit } from '../exec';
import { stderrOf } from '../provision';

/** Directory holding pool state and locks, inside the Git common directory. */
const POOL_DIR_NAME = 'sero-worktree-pool';
const POOL_STATE_FILE = 'pool.json';

export interface RepositoryIdentity {
  /** Stable hash of the canonical Git common directory. */
  repositoryId: string;
  /** Canonical absolute path of the Git common directory. */
  commonDir: string;
  /** Directory holding `pool.json` and the lock domains. */
  poolDir: string;
  statePath: string;
}

export type RepositoryIdentityResult =
  | { status: 'ok'; identity: RepositoryIdentity }
  | { status: 'unavailable'; reason: string };

/** Resolves symlinks where possible; falls back to a normalised absolute path. */
export async function canonicalPath(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch {
    return path.resolve(target);
  }
}

/** True when `child` is `parent` itself or lies beneath it. */
export function isContainedIn(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveRepositoryIdentity(
  workspacePath: string,
): Promise<RepositoryIdentityResult> {
  let raw: string;
  try {
    const { stdout } = await execWorktreeGit(['rev-parse', '--git-common-dir'], {
      cwd: workspacePath,
      timeout: 5_000,
    });
    raw = stdout.trim();
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `Could not resolve the Git common directory: ${stderrOf(error).trim()}`,
    };
  }
  if (!raw) return { status: 'unavailable', reason: 'Git reported no common directory.' };

  const absolute = path.isAbsolute(raw) ? raw : path.resolve(workspacePath, raw);
  const commonDir = await canonicalPath(absolute);
  const poolDir = path.join(commonDir, POOL_DIR_NAME);
  return {
    status: 'ok',
    identity: {
      repositoryId: createHash('sha256').update(commonDir).digest('hex').slice(0, 32),
      commonDir,
      poolDir,
      statePath: path.join(poolDir, POOL_STATE_FILE),
    },
  };
}
