import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execWorktreeGit } from './exec';

/** Keep one immutable base per Room, including across restarts and roster changes. */
export async function getWorkspaceSnapshotBase(workspacePath: string, key: string): Promise<string> {
  const ref = `refs/sero/worktree-bases/${createHash('sha256').update(key).digest('hex')}`;
  const options = { cwd: workspacePath, timeout: 30_000 };
  const existing = await execWorktreeGit(['rev-parse', '--verify', ref], options)
    .then((result) => result.stdout.trim(), () => null);
  if (existing) return existing;

  // As with turn-undo snapshots, a temporary index keeps HEAD and staging intact.
  const directory = await mkdtemp(path.join(tmpdir(), 'sero-worktree-base-'));
  const snapshotOptions = { ...options, env: { GIT_INDEX_FILE: path.join(directory, 'index') } };
  try {
    const head = await execWorktreeGit(['rev-parse', '--verify', 'HEAD'], options)
      .then((result) => result.stdout.trim(), () => null);
    await execWorktreeGit(head ? ['read-tree', head] : ['read-tree', '--empty'], snapshotOptions);
    await execWorktreeGit(['add', '-A'], snapshotOptions);
    await execWorktreeGit(['rm', '-r', '--cached', '--ignore-unmatch', '--', '.sero'], snapshotOptions);
    const tree = (await execWorktreeGit(['write-tree'], snapshotOptions)).stdout.trim();
    const commit = (await execWorktreeGit([
      '-c', 'user.name=Sero', '-c', 'user.email=sero@local',
      'commit-tree', tree, ...(head ? ['-p', head] : []), '-m', `Workspace base for ${key}`,
    ], options)).stdout.trim();
    // Concurrent members may capture together; all use the first stored base.
    await execWorktreeGit(['update-ref', ref, commit, ''], options).catch(async (error: unknown) => {
      const winner = await execWorktreeGit(['rev-parse', '--verify', ref], options).then(() => true, () => false);
      if (!winner) throw error;
    });
    return (await execWorktreeGit(['rev-parse', '--verify', ref], options)).stdout.trim();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
