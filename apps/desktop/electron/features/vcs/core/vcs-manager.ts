import { EventEmitter } from 'events';

import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { CreateCheckpointOptions, VcsCheckpoint, VcsCheckpointSource, VcsEvent, VcsWorkspaceState } from '../support/types';
import { GitRunner } from './git-runner';
import { InternalSnapshotManager } from './internal-snapshot-manager';

function nowIso(): string {
  return new Date().toISOString();
}

/** Infer checkpoint source from the description prefix set by createCheckpoint/restoreCheckpoint. */
function parseSourceFromDescription(description: string): VcsCheckpointSource {
  if (description.startsWith('checkpoint: turn')) return 'turn';
  if (description.startsWith('checkpoint: filesystem')) return 'fs';
  if (description.startsWith('checkpoint: restore') || description.startsWith('restore:')) return 'restore';
  if (description.startsWith('checkpoint: manual')) return 'manual';
  return 'manual';
}

export class VcsManager extends EventEmitter {
  private readonly runner: GitRunner;

  private readonly snapshots: InternalSnapshotManager;

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    runner: GitRunner,
  ) {
    super();
    this.runner = runner;
    this.snapshots = new InternalSnapshotManager(runner);
  }

  private emitEvent(event: VcsEvent): void {
    this.emit('event', event);
  }

  private async ensureRepoInitialized(workspaceId: string): Promise<void> {
    await this.runner.ensureRepoInitialized(workspaceId);
  }

  async createInternalSnapshot(workspaceId: string): Promise<string> {
    return this.snapshots.createSnapshot(workspaceId);
  }

  async cleanupInternalSnapshots(workspaceId: string): Promise<void> {
    await this.snapshots.cleanupSnapshots(workspaceId);
  }

  async hasSnapshotDiff(workspaceId: string, snapshotId: string): Promise<boolean> {
    return this.snapshots.hasWorkingTreeChangesSinceSnapshot(workspaceId, snapshotId);
  }

  async getCurrentChangeId(workspaceId: string): Promise<string | null> {
    await this.ensureRepoInitialized(workspaceId);

    const result = await this.runner.run(workspaceId, [
      'rev-parse',
      '--short=12',
      'HEAD',
    ]);

    if (result.exitCode !== 0) {
      // No commits yet — empty repo
      if (
        result.stderr.includes('unknown revision') ||
        result.stderr.includes('ambiguous argument') ||
        result.stderr.includes('Needed a single revision')
      ) {
        return null;
      }
      throw new Error(result.stderr || 'Failed to resolve current commit');
    }

    const id = result.stdout.trim();
    return id || null;
  }

  async hasWorkingCopyChanges(workspaceId: string): Promise<boolean> {
    await this.ensureRepoInitialized(workspaceId);

    const result = await this.runner.run(workspaceId, [
      'status',
      '--porcelain',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to inspect working copy changes');
    }

    return result.stdout.trim().length > 0;
  }

  async listCheckpoints(workspaceId: string, limit = 40): Promise<VcsCheckpoint[]> {
    await this.ensureRepoInitialized(workspaceId);

    // Check for any commits at all
    const hasCommits = await this.runner.run(workspaceId, ['rev-parse', 'HEAD']);
    if (hasCommits.exitCode !== 0) return [];

    const result = await this.runner.run(workspaceId, [
      'log',
      `--max-count=${limit}`,
      '--format=%h\t%aI\t%s',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to list checkpoints');
    }

    const checkpoints: VcsCheckpoint[] = [];
    for (const raw of result.stdout.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;

      const parts = line.split('\t');
      const changeId = parts[0] ?? line;
      const timestamp = parts[1] ?? '';
      const description = (parts[2] ?? '').trim() || '(no description)';
      const source = parseSourceFromDescription(description);

      checkpoints.push({
        changeId,
        description,
        source,
        createdAt: timestamp || nowIso(),
      });
    }

    return checkpoints;
  }

  async getWorkspaceState(workspaceId: string, limit = 40): Promise<VcsWorkspaceState> {
    const [currentChangeId, hasWorkingCopyChanges, checkpoints] = await Promise.all([
      this.getCurrentChangeId(workspaceId),
      this.hasWorkingCopyChanges(workspaceId),
      this.listCheckpoints(workspaceId, limit),
    ]);

    return {
      workspaceId,
      currentChangeId,
      hasWorkingCopyChanges,
      checkpoints,
    };
  }

  private buildDefaultDescription(source: CreateCheckpointOptions['source']): string {
    switch (source) {
      case 'turn':
        return `checkpoint: turn @ ${new Date().toLocaleString()}`;
      case 'fs':
        return `checkpoint: filesystem change @ ${new Date().toLocaleString()}`;
      case 'restore':
        return `checkpoint: restore @ ${new Date().toLocaleString()}`;
      default:
        return `checkpoint: manual @ ${new Date().toLocaleString()}`;
    }
  }

  async createCheckpoint(
    workspaceId: string,
    options: CreateCheckpointOptions,
  ): Promise<VcsCheckpoint | null> {
    await this.ensureRepoInitialized(workspaceId);

    const hasChanges = await this.hasWorkingCopyChanges(workspaceId);
    if (!hasChanges) return null;

    const source: VcsCheckpointSource = options.source;
    const description = (options.description?.trim() || this.buildDefaultDescription(source)).slice(0, 300);

    // Stage all changes
    const add = await this.runner.run(workspaceId, ['add', '-A']);
    if (add.exitCode !== 0) {
      throw new Error(add.stderr || 'Failed to stage changes');
    }

    // Commit
    const commit = await this.runner.run(workspaceId, ['commit', '-m', description]);
    if (commit.exitCode !== 0) {
      throw new Error(commit.stderr || 'Failed to create checkpoint commit');
    }

    // Get the SHA of the commit we just created
    const sha = await this.runner.run(workspaceId, ['rev-parse', '--short=12', 'HEAD']);
    const changeId = sha.exitCode === 0 ? sha.stdout.trim() : 'unknown';

    const checkpoint: VcsCheckpoint = {
      changeId,
      description,
      source,
      createdAt: nowIso(),
    };

    this.emitEvent({
      type: 'checkpoint_created',
      workspaceId,
      checkpoint,
    });

    return checkpoint;
  }

  /**
   * Restore workspace files to the state at the given checkpoint.
   *
   * Uses `git checkout <sha> -- .` to restore tracked paths that exist in the
   * target snapshot, explicitly removes tracked files added after that snapshot,
   * then stages and commits the restore to keep history linear.
   */
  async restoreCheckpoint(workspaceId: string, changeId: string): Promise<void> {
    await this.ensureRepoInitialized(workspaceId);

    if (this.snapshots.isInternalSnapshotId(changeId)) {
      console.log(`[vcs] Restoring workspace=${workspaceId} to internal snapshot=${changeId}`);
      await this.snapshots.restoreSnapshot(workspaceId, changeId);
      console.log(`[vcs] Internal snapshot restore finished for workspace=${workspaceId}, snapshot=${changeId}`);
      this.emitEvent({
        type: 'restored',
        workspaceId,
        checkpointId: changeId,
      });
      return;
    }

    console.log(`[vcs] Restoring workspace=${workspaceId} to checkpoint=${changeId}`);
    const addedSinceTarget = await this.runner.run(workspaceId, [
      'diff',
      '--name-only',
      '--diff-filter=A',
      changeId,
      'HEAD',
      '--',
      '.',
    ]);
    if (addedSinceTarget.exitCode !== 0) {
      throw new Error(addedSinceTarget.stderr || `Failed to compare checkpoint ${changeId}`);
    }

    const addedPaths = addedSinceTarget.stdout
      .split(/\r?\n/)
      .map((rawPath) => rawPath.trim())
      .filter(Boolean);
    console.log(
      `[vcs] Files added after checkpoint ${changeId} in workspace=${workspaceId}: ${addedPaths.length > 0 ? addedPaths.join(', ') : '(none)'}`,
    );

    // Restore all files that exist in the target checkpoint state.
    const checkout = await this.runner.run(workspaceId, [
      'checkout',
      changeId,
      '--',
      '.',
    ]);

    if (checkout.exitCode !== 0) {
      throw new Error(checkout.stderr || `Failed to restore checkpoint ${changeId}`);
    }

    // Remove tracked files that were added after the target checkpoint.
    for (const filePath of addedPaths) {
      console.log(`[vcs] Removing file added after target checkpoint: ${filePath}`);
      const remove = await this.runner.run(workspaceId, ['rm', '-f', '--', filePath]);
      if (remove.exitCode !== 0) {
        throw new Error(remove.stderr || `Failed to remove ${filePath} during restore`);
      }
    }

    // Also clean untracked files that didn't exist at the checkpoint.
    const clean = await this.runner.run(workspaceId, ['clean', '-fd']);
    if (clean.exitCode !== 0) {
      throw new Error(clean.stderr || `Failed to clean workspace for checkpoint ${changeId}`);
    }

    // Stage everything and commit the restore.
    const add = await this.runner.run(workspaceId, ['add', '-A']);
    if (add.exitCode !== 0) {
      throw new Error(add.stderr || 'Failed to stage restored files');
    }

    const hasChanges = await this.hasWorkingCopyChanges(workspaceId);
    if (hasChanges) {
      const commit = await this.runner.run(workspaceId, [
        'commit',
        '-m',
        `restore: ${changeId}`,
      ]);
      if (commit.exitCode !== 0) {
        throw new Error(commit.stderr || `Failed to commit restore for ${changeId}`);
      }
    }

    console.log(`[vcs] Restore finished for workspace=${workspaceId}, checkpoint=${changeId}`);
    this.emitEvent({
      type: 'restored',
      workspaceId,
      checkpointId: changeId,
    });
  }

  async diff(workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string> {
    await this.ensureRepoInitialized(workspaceId);

    if (!toChangeId?.trim() && this.snapshots.isInternalSnapshotId(fromChangeId)) {
      return this.snapshots.diffSnapshotToWorkingTree(workspaceId, fromChangeId);
    }

    const fromRevision = this.snapshots.isInternalSnapshotId(fromChangeId)
      ? this.snapshots.resolveRevision(fromChangeId)
      : fromChangeId;
    const toRevision = toChangeId?.trim()
      ? this.snapshots.isInternalSnapshotId(toChangeId.trim())
        ? this.snapshots.resolveRevision(toChangeId.trim())
        : toChangeId.trim()
      : null;

    const args = ['diff'];
    if (toRevision) {
      args.push(`${fromRevision}..${toRevision}`);
    } else {
      // Diff from the given commit to the current working tree
      args.push(fromRevision);
    }

    const diff = await this.runner.run(workspaceId, args, 60_000);
    if (diff.exitCode !== 0) {
      throw new Error(diff.stderr || 'Failed to generate diff');
    }

    return diff.stdout;
  }

  watchWorkspace(workspaceId: string): void {
    // Explicit checkpoint mode: no automatic filesystem-based checkpointing.
    void this.workspaceManager.getPath(workspaceId);
  }

  unwatchWorkspace(_workspaceId: string): void {}

  disposeAll(): void {}
}
