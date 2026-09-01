/**
 * Git worktree registration evidence.
 *
 * `git worktree list --porcelain -z` is the authority on which checkouts Git
 * actually knows about. The newline-only porcelain format cannot be parsed
 * safely: a path containing a newline splits into two records, so a directory
 * could be attributed to the wrong branch. The NUL-delimited form has no such
 * ambiguity.
 *
 * `-z` reached `git worktree list` in Git 2.36. Older Git still has to work, so
 * an unknown-option failure falls back to the newline format and marks the
 * result as such; callers that need path-exactness can refuse to reuse it.
 */

import { execWorktreeGit } from '../exec';
import { stderrOf } from '../provision';

export interface WorktreeRegistration {
  /** Absolute path exactly as Git reports it. */
  path: string;
  head: string | null;
  /** Full ref (`refs/heads/x`), or null when detached or bare. */
  branchRef: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockedReason: string | null;
  prunable: boolean;
  prunableReason: string | null;
}

export type RegistrationListing =
  | { status: 'ok'; records: WorktreeRegistration[]; nulDelimited: boolean }
  /** Git could not be read. The repository is not safe for automatic pool use. */
  | { status: 'unavailable'; reason: string };

function emptyRecord(): WorktreeRegistration {
  return {
    path: '',
    head: null,
    branchRef: null,
    detached: false,
    bare: false,
    locked: false,
    lockedReason: null,
    prunable: false,
    prunableReason: null,
  };
}

/**
 * Both porcelain forms are "one attribute per line, blank line between
 * records"; `-z` only replaces the line terminator with NUL, which turns the
 * blank line into an empty token.
 */
export function parseWorktreeListing(raw: string, delimiter: '\0' | '\n'): WorktreeRegistration[] {
  const records: WorktreeRegistration[] = [];
  let current: WorktreeRegistration | null = null;

  const flush = (): void => {
    if (current && current.path) records.push(current);
    current = null;
  };

  for (const token of raw.split(delimiter)) {
    const line = delimiter === '\n' ? token.replace(/\r$/, '') : token;
    if (line === '') {
      flush();
      continue;
    }
    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);

    if (key === 'worktree') {
      flush();
      current = { ...emptyRecord(), path: value };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value || null;
    else if (key === 'branch') current.branchRef = value || null;
    else if (key === 'detached') current.detached = true;
    else if (key === 'bare') current.bare = true;
    else if (key === 'locked') {
      current.locked = true;
      current.lockedReason = value || null;
    } else if (key === 'prunable') {
      current.prunable = true;
      current.prunableReason = value || null;
    }
  }
  flush();
  return records;
}

/** Short branch name of a registration (`refs/heads/feat/x` → `feat/x`). */
export function registrationBranch(record: WorktreeRegistration): string | null {
  if (!record.branchRef) return null;
  return record.branchRef.startsWith('refs/heads/')
    ? record.branchRef.slice('refs/heads/'.length)
    : record.branchRef;
}

export async function listWorktreeRegistrations(workspacePath: string): Promise<RegistrationListing> {
  try {
    const { stdout } = await execWorktreeGit(['worktree', 'list', '--porcelain', '-z'], {
      cwd: workspacePath,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { status: 'ok', records: parseWorktreeListing(stdout, '\0'), nulDelimited: true };
  } catch (error) {
    const detail = stderrOf(error);
    // Only an unrecognised `-z` justifies the weaker format. Any other failure
    // means Git evidence is unreadable, and the repository fails closed.
    if (!/unknown option|usage: git worktree|error: unknown switch/i.test(detail)) {
      return { status: 'unavailable', reason: detail.trim() || 'git worktree list failed' };
    }
  }

  try {
    const { stdout } = await execWorktreeGit(['worktree', 'list', '--porcelain'], {
      cwd: workspacePath,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { status: 'ok', records: parseWorktreeListing(stdout, '\n'), nulDelimited: false };
  } catch (error) {
    return { status: 'unavailable', reason: stderrOf(error).trim() || 'git worktree list failed' };
  }
}
