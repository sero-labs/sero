import type { JjRunner } from './jj-runner';
import {
  LOG_TEMPLATE,
  BOOKMARK_TEMPLATE,
  OP_LOG_TEMPLATE,
  parseLogEntries,
  parseStatus,
  parseDiffSummary,
  parseBookmarks,
  parseRemotes,
  parseOperationLog,
} from './parsers';
import { isAutoPushBookmark, inferConventionalType, slugifyBranchLabel } from './branch-naming';
import type {
  ChangeEntry,
  WorkingCopyStatus,
  FileDiffEntry,
  Bookmark,
  Remote,
  OperationEntry,
  SyncResult,
  PushPreview,
} from '../../src/types/vcs';

const DEFAULT_PRIMARY_BOOKMARK = 'main';

export class VcsOps {
  constructor(private readonly runner: JjRunner) {}

  async getLogEntries(
    workspaceId: string,
    limit = 40,
    revset?: string,
  ): Promise<ChangeEntry[]> {
    const args = ['log', '--no-graph', '-T', LOG_TEMPLATE, '--limit', String(limit)];
    if (revset) args.push('-r', revset);

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Failed to load change log');
    return parseLogEntries(result.stdout);
  }

  async getStatus(workspaceId: string): Promise<WorkingCopyStatus> {
    const result = await this.runner.run(workspaceId, ['status']);
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Failed to get status');
    return parseStatus(result.stdout);
  }

  async getFileDiffSummary(
    workspaceId: string,
    from: string,
    to?: string,
  ): Promise<FileDiffEntry[]> {
    const args = to
      ? ['diff', '--summary', '--from', from, '--to', to]
      : ['diff', '--summary', '-r', from];

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Failed to get diff summary');
    return parseDiffSummary(result.stdout);
  }

  async getFileContent(
    workspaceId: string,
    revset: string,
    path: string,
  ): Promise<string> {
    const result = await this.runner.run(
      workspaceId,
      ['file', 'show', '-r', revset, path],
      60_000,
    );
    if (result.exitCode !== 0) {
      // File might not exist at this revision — return empty
      if (result.stderr.includes('No such path')) return '';
      throw new Error(result.stderr || 'Failed to read file at revision');
    }

    return result.stdout;
  }

  async describeChange(
    workspaceId: string,
    changeId: string,
    message: string,
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, [
      'describe',
      '-r',
      changeId,
      '-m',
      message,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to describe change');
    }
  }

  async listBookmarks(workspaceId: string): Promise<Bookmark[]> {
    const result = await this.runner.run(workspaceId, [
      'bookmark',
      'list',
      '--all-remotes',
      '-T',
      BOOKMARK_TEMPLATE,
    ]);
    if (result.exitCode !== 0) {
      // No bookmarks yet is fine
      if (result.stderr.includes('No bookmarks')) return [];
      throw new Error(result.stderr || 'Failed to list bookmarks');
    }

    return parseBookmarks(result.stdout);
  }

  async createBookmark(
    workspaceId: string,
    name: string,
    revision = '@',
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, [
      'bookmark',
      'create',
      name,
      '-r',
      revision,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to create bookmark '${name}'`);
    }
  }

  async deleteBookmark(workspaceId: string, name: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['bookmark', 'delete', name]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to delete bookmark '${name}'`);
    }
  }

  async moveBookmark(
    workspaceId: string,
    name: string,
    toRevision: string,
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, [
      'bookmark',
      'move',
      name,
      '--to',
      toRevision,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to move bookmark '${name}'`);
    }
  }

  async listRemotes(workspaceId: string): Promise<Remote[]> {
    const result = await this.runner.run(workspaceId, ['git', 'remote', 'list']);
    if (result.exitCode !== 0) {
      return [];
    }

    return parseRemotes(result.stdout);
  }

  async addRemote(
    workspaceId: string,
    name: string,
    url: string,
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, ['git', 'remote', 'add', name, url]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to add remote '${name}'`);
    }
  }

  async removeRemote(workspaceId: string, name: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['git', 'remote', 'remove', name]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to remove remote '${name}'`);
    }
  }

  private async getChangeDescription(
    workspaceId: string,
    changeId: string,
  ): Promise<string> {
    const result = await this.runner.run(workspaceId, [
      'log',
      '--no-graph',
      '-r',
      changeId,
      '-T',
      'description.first_line()',
    ]);

    if (result.exitCode !== 0) return '';
    return result.stdout.trim();
  }

  private async suggestPushBookmarkForChange(
    workspaceId: string,
    changeId: string,
    bookmarks: Bookmark[],
  ): Promise<string> {
    // 1. Prefer an existing bookmark already pointing at this exact change
    const localAtTarget = bookmarks
      .filter((bm) => bm.isLocal && bm.changeId === changeId)
      .map((bm) => bm.name);

    const preferredAtTarget = localAtTarget.find((name) => name === DEFAULT_PRIMARY_BOOKMARK)
      ?? localAtTarget.find((name) => !isAutoPushBookmark(name));
    if (preferredAtTarget) return preferredAtTarget;

    // 2. Generate a descriptive feature branch name.
    //    Never fall back to moving shared branches (e.g. main) to an arbitrary
    //    change — that would silently rewrite shared history.
    const description = await this.getChangeDescription(workspaceId, changeId);
    const type = inferConventionalType(description);
    const label = slugifyBranchLabel(description);
    return `${type}/${label}-${changeId.slice(0, 8)}`;
  }

  private async ensureBookmarkAtChange(
    workspaceId: string,
    bookmark: string,
    changeId: string,
  ): Promise<void> {
    const create = await this.runner.run(workspaceId, [
      'bookmark',
      'create',
      bookmark,
      '-r',
      changeId,
    ]);
    if (create.exitCode === 0) return;

    const createErr = create.stderr.toLowerCase();
    if (!createErr.includes('already exists')) {
      throw new Error(create.stderr || `Failed to create bookmark '${bookmark}'`);
    }

    const move = await this.runner.run(workspaceId, [
      'bookmark',
      'move',
      bookmark,
      '--to',
      changeId,
    ]);

    if (move.exitCode !== 0) {
      const moveErr = move.stderr.toLowerCase();
      if (!moveErr.includes('already points') && !moveErr.includes('already at')) {
        throw new Error(move.stderr || `Failed to move bookmark '${bookmark}'`);
      }
    }
  }

  private async resolvePushRemote(workspaceId: string): Promise<string | undefined> {
    try {
      const remotes = await this.listRemotes(workspaceId);
      return remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name;
    } catch (err) {
      console.warn('[vcs-ops] Failed to resolve push remote:', err);
      return undefined;
    }
  }

  private isStaleRemotePushError(stderr: string): boolean {
    const msg = stderr.toLowerCase();
    return msg.includes('unexpectedly moved on the remote') || msg.includes('stale info');
  }

  async fetch(workspaceId: string, remote?: string): Promise<SyncResult> {
    const args = ['git', 'fetch'];
    if (remote) args.push('--remote', remote);

    const result = await this.runner.run(workspaceId, args, 120_000);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Fetch failed' };
    }

    return { success: true, message: result.stderr || result.stdout || 'Fetch complete' };
  }

  async pushDryRun(
    workspaceId: string,
    bookmark?: string,
    changeId?: string,
  ): Promise<PushPreview> {
    let resolvedBookmark = bookmark;
    if (!resolvedBookmark && changeId) {
      try {
        const bookmarks = await this.listBookmarks(workspaceId);
        resolvedBookmark = await this.suggestPushBookmarkForChange(workspaceId, changeId, bookmarks);
      } catch (err) {
        console.warn('[vcs-ops] Dry-run bookmark suggestion failed (best-effort):', err);
      }
    }

    const pushRemote = await this.resolvePushRemote(workspaceId);
    const args = ['git', 'push', '--dry-run'];
    if (pushRemote) args.push('--remote', pushRemote);
    if (resolvedBookmark) args.push('--bookmark', resolvedBookmark);
    else if (changeId) args.push('--change', changeId);

    const result = await this.runner.run(workspaceId, args, 60_000);
    const output = result.stdout + '\n' + result.stderr;

    return {
      bookmarks: resolvedBookmark ? [resolvedBookmark] : [],
      willCreate: [],
      message: output.trim(),
    };
  }

  async push(
    workspaceId: string,
    bookmark?: string,
    changeId?: string,
  ): Promise<SyncResult> {
    let resolvedBookmark = bookmark;
    if (resolvedBookmark && changeId) {
      try {
        await this.ensureBookmarkAtChange(workspaceId, resolvedBookmark, changeId);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to move push bookmark',
        };
      }
    }
    if (!resolvedBookmark && changeId) {
      try {
        const bookmarks = await this.listBookmarks(workspaceId);
        resolvedBookmark = await this.suggestPushBookmarkForChange(workspaceId, changeId, bookmarks);
        await this.ensureBookmarkAtChange(workspaceId, resolvedBookmark, changeId);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to prepare push bookmark',
        };
      }
    }

    const pushRemote = await this.resolvePushRemote(workspaceId);
    const buildPushArgs = (): string[] => {
      const args = ['git', 'push'];
      if (pushRemote) args.push('--remote', pushRemote);
      if (resolvedBookmark) args.push('--bookmark', resolvedBookmark);
      else if (changeId) args.push('--change', changeId);
      return args;
    };

    let result = await this.runner.run(workspaceId, buildPushArgs(), 120_000);
    if (result.exitCode !== 0 && this.isStaleRemotePushError(result.stderr || '')) {
      await this.fetch(workspaceId, pushRemote);
      result = await this.runner.run(workspaceId, buildPushArgs(), 120_000);
    }
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Push failed' };
    }

    const output = result.stderr || result.stdout;
    if (resolvedBookmark) {
      const summary = `Pushed bookmark '${resolvedBookmark}'`;
      return {
        success: true,
        message: output?.trim() ? `${summary}\n${output.trim()}` : summary,
      };
    }

    return { success: true, message: output || 'Push complete' };
  }

  async undo(workspaceId: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['undo']);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Undo failed');
    }
  }

  async abandon(workspaceId: string, changeId: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['abandon', changeId]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to abandon ${changeId}`);
    }
  }

  async squash(
    workspaceId: string,
    from?: string,
    into?: string,
  ): Promise<void> {
    const args = ['squash'];
    if (from) args.push('--from', from);
    if (into) args.push('--into', into);

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Squash failed');
    }
  }

  async getOperationLog(
    workspaceId: string,
    limit = 20,
  ): Promise<OperationEntry[]> {
    const result = await this.runner.run(workspaceId, [
      'operation',
      'log',
      '--no-graph',
      '-T',
      OP_LOG_TEMPLATE,
      '--limit',
      String(limit),
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to read operation log');
    }

    return parseOperationLog(result.stdout);
  }
}
