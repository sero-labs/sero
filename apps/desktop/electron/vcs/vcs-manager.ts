import fs from 'fs';
import { EventEmitter } from 'events';

import type { WorkspaceManager } from '../workspace';
import type {
  CreateCheckpointOptions,
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
} from './types';
import { JjRunner } from './jj-runner';

const CHECKPOINT_WATCH_DEBOUNCE_MS = 1200;
const CHECKPOINT_COOLDOWN_MS = 1200;
const RESTORE_SUPPRESS_MS = 2500;

interface WatchState {
  watcher: fs.FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  suppressUntil: number;
  lastCheckpointAt: number;
  checkpointInFlight: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0] ?? '';
  return line.trim();
}

function isIgnoredPath(fileName?: string | null): boolean {
  if (!fileName) return false;
  const normalized = fileName.replace(/\\/g, '/');
  return (
    normalized.includes('/.jj/') ||
    normalized.startsWith('.jj/') ||
    normalized.includes('/.git/') ||
    normalized.startsWith('.git/') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/') ||
    normalized.endsWith('.DS_Store')
  );
}

export class VcsManager extends EventEmitter {
  private readonly runner: JjRunner;
  private readonly watchStates = new Map<string, WatchState>();

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    runner: JjRunner,
  ) {
    super();
    this.runner = runner;
  }

  private emitEvent(event: VcsEvent): void {
    this.emit('event', event);
  }

  private async ensureRepoInitialized(workspaceId: string): Promise<void> {
    const root = await this.runner.run(workspaceId, ['root']);
    if (root.exitCode === 0) return;

    const init = await this.runner.run(workspaceId, ['git', 'init', '--colocate']);
    if (init.exitCode === 0) return;

    const fallback = await this.runner.run(workspaceId, ['init']);
    if (fallback.exitCode !== 0) {
      throw new Error(init.stderr || fallback.stderr || 'Failed to initialize JJ repository');
    }
  }

  async getCurrentChangeId(workspaceId: string): Promise<string | null> {
    await this.ensureRepoInitialized(workspaceId);

    const result = await this.runner.run(workspaceId, [
      'log',
      '-r',
      '@',
      '--no-graph',
      '-T',
      'change_id.short(12)',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to resolve current change id');
    }

    const id = result.stdout.trim();
    return id || null;
  }

  async hasWorkingCopyChanges(workspaceId: string): Promise<boolean> {
    await this.ensureRepoInitialized(workspaceId);

    const result = await this.runner.run(workspaceId, [
      'diff',
      '-r',
      '@',
      '--summary',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to inspect working copy changes');
    }

    return result.stdout.trim().length > 0;
  }

  async listCheckpoints(workspaceId: string, limit = 40): Promise<VcsCheckpoint[]> {
    await this.ensureRepoInitialized(workspaceId);

    const result = await this.runner.run(workspaceId, [
      'log',
      '--no-graph',
      '--limit',
      String(limit),
      '-T',
      'change_id.short(12) ++ "\\t" ++ description.first_line() ++ "\\n"',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to list checkpoints');
    }

    const checkpoints: VcsCheckpoint[] = [];
    for (const raw of result.stdout.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;

      const tab = line.indexOf('\t');
      const changeId = tab === -1 ? line : line.slice(0, tab);
      const description = tab === -1 ? '(no description)' : line.slice(tab + 1).trim() || '(no description)';

      checkpoints.push({
        changeId,
        description,
        source: 'manual',
        createdAt: nowIso(),
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

    const currentChangeId = await this.getCurrentChangeId(workspaceId);
    if (!currentChangeId) {
      throw new Error('Unable to resolve current JJ change');
    }

    const description = (options.description?.trim() || this.buildDefaultDescription(options.source)).slice(0, 300);

    const describe = await this.runner.run(workspaceId, ['describe', '-m', description]);
    if (describe.exitCode !== 0) {
      throw new Error(describe.stderr || 'Failed to describe checkpoint');
    }

    const newWork = await this.runner.run(workspaceId, [
      'new',
      '-m',
      `wip: ${options.source}`,
    ]);
    if (newWork.exitCode !== 0) {
      throw new Error(newWork.stderr || 'Failed to advance to next working change');
    }

    const checkpoint: VcsCheckpoint = {
      changeId: currentChangeId,
      description,
      source: options.source,
      createdAt: nowIso(),
    };

    const watchState = this.watchStates.get(workspaceId);
    if (watchState) watchState.lastCheckpointAt = Date.now();

    this.emitEvent({
      type: 'checkpoint_created',
      workspaceId,
      checkpoint,
    });

    return checkpoint;
  }

  async restoreCheckpoint(workspaceId: string, changeId: string): Promise<void> {
    await this.ensureRepoInitialized(workspaceId);

    const restore = await this.runner.run(workspaceId, [
      'new',
      changeId,
      '-m',
      `restore: ${changeId}`,
    ]);

    if (restore.exitCode !== 0) {
      throw new Error(restore.stderr || `Failed to restore checkpoint ${changeId}`);
    }

    const watchState = this.watchStates.get(workspaceId);
    if (watchState) {
      watchState.suppressUntil = Date.now() + RESTORE_SUPPRESS_MS;
      watchState.lastCheckpointAt = Date.now();
    }

    this.emitEvent({
      type: 'restored',
      workspaceId,
      checkpointId: changeId,
    });
  }

  async diff(workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string> {
    await this.ensureRepoInitialized(workspaceId);

    const args = ['diff', '--from', fromChangeId];
    if (toChangeId?.trim()) {
      args.push('--to', toChangeId.trim());
    }
    args.push('--git');

    const diff = await this.runner.run(workspaceId, args, 60_000);
    if (diff.exitCode !== 0) {
      throw new Error(diff.stderr || 'Failed to generate diff');
    }

    return diff.stdout;
  }

  private async maybeCheckpointFromFs(workspaceId: string): Promise<void> {
    const watchState = this.watchStates.get(workspaceId);
    if (!watchState) return;

    const now = Date.now();
    if (watchState.checkpointInFlight) return;
    if (now < watchState.suppressUntil) return;
    if (now - watchState.lastCheckpointAt < CHECKPOINT_COOLDOWN_MS) return;

    watchState.checkpointInFlight = true;
    try {
      await this.createCheckpoint(workspaceId, { source: 'fs' });
    } catch (err) {
      this.emitEvent({
        type: 'error',
        workspaceId,
        error: err instanceof Error ? err.message : 'Filesystem checkpoint failed',
      });
    } finally {
      watchState.checkpointInFlight = false;
    }
  }

  watchWorkspace(workspaceId: string): void {
    if (this.watchStates.has(workspaceId)) return;

    const workspacePath = this.workspaceManager.getPath(workspaceId);
    if (!workspacePath) return;

    const state: WatchState = {
      watcher: null,
      debounceTimer: null,
      suppressUntil: 0,
      lastCheckpointAt: 0,
      checkpointInFlight: false,
    };

    try {
      state.watcher = fs.watch(workspacePath, { recursive: true }, (_event, fileName) => {
        if (isIgnoredPath(fileName)) return;

        if (state.debounceTimer) {
          clearTimeout(state.debounceTimer);
        }

        state.debounceTimer = setTimeout(() => {
          state.debounceTimer = null;
          void this.maybeCheckpointFromFs(workspaceId);
        }, CHECKPOINT_WATCH_DEBOUNCE_MS);
      });

      state.watcher.on('error', (err) => {
        this.emitEvent({
          type: 'error',
          workspaceId,
          error: err instanceof Error ? err.message : 'Workspace watcher failed',
        });
      });
    } catch (err) {
      this.emitEvent({
        type: 'error',
        workspaceId,
        error: err instanceof Error ? err.message : 'Failed to start workspace watcher',
      });
    }

    this.watchStates.set(workspaceId, state);
  }

  unwatchWorkspace(workspaceId: string): void {
    const state = this.watchStates.get(workspaceId);
    if (!state) return;

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.watcher) {
      state.watcher.close();
      state.watcher = null;
    }

    this.watchStates.delete(workspaceId);
  }

  disposeAll(): void {
    for (const workspaceId of this.watchStates.keys()) {
      this.unwatchWorkspace(workspaceId);
    }
  }
}
