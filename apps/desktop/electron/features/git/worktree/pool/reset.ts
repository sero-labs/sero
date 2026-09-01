import { promises as fs } from 'node:fs';
import path from 'node:path';

import { execWorktreeGit } from '../exec';
import { checkoutCleanliness } from './checkout';
import { listWorktreeRegistrations } from './registration';
import { canonicalPath } from './repository';

export type ResetResult =
  | { status: 'reset'; preservedIgnoredPaths: number }
  | { status: 'failed'; reason: string };

async function ignoredPaths(worktreePath: string): Promise<string[]> {
  const { stdout } = await execWorktreeGit([
    'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z',
  ], { cwd: worktreePath, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout.split('\0').filter(Boolean);
}

async function verifyIgnoredPaths(worktreePath: string, before: string[]): Promise<boolean> {
  const checks = await Promise.all(before.map(async (entry) => {
    const relative = entry.endsWith('/') ? entry.slice(0, -1) : entry;
    return (await fs.stat(path.join(worktreePath, relative)).catch(() => null)) !== null;
  }));
  return checks.every(Boolean);
}

/** Cache-preserving reset of one reserved, already registered checkout. */
export async function resetCheckout(workspacePath: string, worktreePath: string, targetCommit: string): Promise<ResetResult> {
  try {
    const ignoredBefore = await ignoredPaths(worktreePath);
    await execWorktreeGit(['switch', '--detach', targetCommit], { cwd: worktreePath, timeout: 30_000 });
    await execWorktreeGit(['reset', '--hard', targetCommit], { cwd: worktreePath, timeout: 30_000 });
    await execWorktreeGit(['clean', '-fd'], { cwd: worktreePath, timeout: 30_000 });

    const [listing, cleanliness, head, canonical] = await Promise.all([
      listWorktreeRegistrations(workspacePath),
      checkoutCleanliness(worktreePath),
      execWorktreeGit(['rev-parse', 'HEAD'], { cwd: worktreePath, timeout: 10_000 }),
      canonicalPath(worktreePath),
    ]);
    if (listing.status !== 'ok') return { status: 'failed', reason: `Registration verification failed: ${listing.reason}` };
    if (!listing.nulDelimited) {
      return { status: 'failed', reason: 'Git cannot provide path-exact NUL-delimited registration evidence.' };
    }
    const registration = await Promise.all(listing.records.map(async (record) => ({
      record,
      path: await canonicalPath(record.path),
    }))).then((records) => records.find((entry) => entry.path === canonical)?.record);
    if (!registration || registration.prunable || registration.locked || !registration.detached) {
      return { status: 'failed', reason: 'The reset checkout registration is missing, locked, prunable, or not detached.' };
    }
    if (registration.head !== targetCommit || head.stdout.trim() !== targetCommit) {
      return { status: 'failed', reason: 'The reset checkout HEAD does not equal the recorded exact target.' };
    }
    if (cleanliness.status !== 'clean') {
      return {
        status: 'failed',
        reason: cleanliness.status === 'dirty'
          ? `The reset checkout is still dirty: ${cleanliness.detail}`
          : `The reset checkout could not be verified clean: ${cleanliness.reason}`,
      };
    }
    if (!await verifyIgnoredPaths(worktreePath, ignoredBefore)) {
      return { status: 'failed', reason: 'At least one ignored dependency or cache path was lost during reset.' };
    }
    return { status: 'reset', preservedIgnoredPaths: ignoredBefore.length };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
