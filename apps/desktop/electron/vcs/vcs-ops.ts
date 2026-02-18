/**
 * VcsOps — rich VCS operations (log, status, bookmarks, remotes, push, fetch).
 *
 * Extends VcsManager's checkpoint-focused API with full JJ power tools.
 * Separated to keep each file under 500 LOC.
 */

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

export class VcsOps {
  constructor(private readonly runner: JjRunner) {}

  // ── Change Log ─────────────────────────────────────────────

  async getLogEntries(
    workspaceId: string,
    limit = 40,
    revset?: string,
  ): Promise<ChangeEntry[]> {
    const args = ['log', '--no-graph', '-T', LOG_TEMPLATE, '--limit', String(limit)];
    if (revset) args.push('-r', revset);

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to load change log');
    }

    return parseLogEntries(result.stdout);
  }

  // ── Working Copy Status ────────────────────────────────────

  async getStatus(workspaceId: string): Promise<WorkingCopyStatus> {
    const result = await this.runner.run(workspaceId, ['status']);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to get status');
    }

    return parseStatus(result.stdout);
  }

  // ── Diff Summary (structured file list) ────────────────────

  async getFileDiffSummary(
    workspaceId: string,
    from: string,
    to?: string,
  ): Promise<FileDiffEntry[]> {
    const args = ['diff', '--summary', '--from', from];
    if (to) args.push('--to', to);

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to get diff summary');
    }

    return parseDiffSummary(result.stdout);
  }

  // ── File Content at Revision ───────────────────────────────

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

  // ── Describe Change ────────────────────────────────────────

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

  // ── Bookmarks ──────────────────────────────────────────────

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

  // ── Remotes ────────────────────────────────────────────────

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

  // ── Fetch & Push ───────────────────────────────────────────

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
    const args = ['git', 'push', '--dry-run'];
    if (bookmark) args.push('--bookmark', bookmark);
    else if (changeId) args.push('--change', changeId);

    const result = await this.runner.run(workspaceId, args, 60_000);
    const output = result.stdout + '\n' + result.stderr;

    return {
      bookmarks: bookmark ? [bookmark] : [],
      willCreate: [],
      message: output.trim(),
    };
  }

  async push(
    workspaceId: string,
    bookmark?: string,
    changeId?: string,
  ): Promise<SyncResult> {
    const args = ['git', 'push'];
    if (bookmark) args.push('--bookmark', bookmark);
    else if (changeId) args.push('--change', changeId);

    const result = await this.runner.run(workspaceId, args, 120_000);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Push failed' };
    }

    return { success: true, message: result.stderr || result.stdout || 'Push complete' };
  }

  // ── Undo & Abandon ────────────────────────────────────────

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

  // ── Squash ─────────────────────────────────────────────────

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

  // ── Operation Log ──────────────────────────────────────────

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
