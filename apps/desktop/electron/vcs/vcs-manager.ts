import { EventEmitter } from 'events';

import type { WorkspaceManager } from '../workspace';
import type { CreateCheckpointOptions, VcsCheckpoint, VcsCheckpointSource, VcsEvent, VcsWorkspaceState } from './types';
import { GitRunner } from './git-runner';

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

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    runner: GitRunner,
  ) {
    super();
    this.runner = runner;
  }

  private emitEvent(event: VcsEvent): void {
    this.emit('event', event);
  }

  private async ensureRepoInitialized(workspaceId: string): Promise<void> {
    const root = await this.runner.run(workspaceId, ['rev-parse', '--git-dir']);
    if (root.exitCode === 0) return;

    const init = await this.runner.run(workspaceId, ['init']);
    if (init.exitCode !== 0) {
      throw new Error(init.stderr || 'Failed to initialize Git repository');
    }
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

    const source: VcsCheckpointSource = options.source === 'fs' ? 'manual' : options.source;
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
   * Uses `git checkout <sha> -- .` to restore all files to the checkpoint
   * state, then stages and commits as a restore point to keep history linear.
   */
  async restoreCheckpoint(workspaceId: string, changeId: string): Promise<void> {
    await this.ensureRepoInitialized(workspaceId);

    // Restore all files to the checkpoint state
    const checkout = await this.runner.run(workspaceId, [
      'checkout',
      changeId,
      '--',
      '.',
    ]);

    if (checkout.exitCode !== 0) {
      throw new Error(checkout.stderr || `Failed to restore checkpoint ${changeId}`);
    }

    // Also clean untracked files that didn't exist at the checkpoint
    await this.runner.run(workspaceId, ['clean', '-fd']);

    // Stage everything and commit the restore
    await this.runner.run(workspaceId, ['add', '-A']);

    const hasChanges = await this.hasWorkingCopyChanges(workspaceId);
    if (hasChanges) {
      await this.runner.run(workspaceId, [
        'commit',
        '-m',
        `restore: ${changeId}`,
      ]);
    }

    this.emitEvent({
      type: 'restored',
      workspaceId,
      checkpointId: changeId,
    });
  }

  async diff(workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string> {
    await this.ensureRepoInitialized(workspaceId);

    const args = ['diff'];
    if (toChangeId?.trim()) {
      args.push(`${fromChangeId}..${toChangeId.trim()}`);
    } else {
      // Diff from the given commit to the current working tree
      args.push(fromChangeId);
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
