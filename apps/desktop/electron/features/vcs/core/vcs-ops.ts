import type { GitRunner } from './git-runner';
import {
  LOG_FORMAT,
  REFLOG_FORMAT,
  parseDiffSummary,
  parseLogEntries,
  parseReflog,
  parseStatus,
} from '../support/parsers';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  moveBookmark,
} from './vcs-ops/bookmark-ops';
import {
  addRemote,
  checkoutRemote,
  listRemotes,
  removeRemote,
  resolvePushRemote,
  setRemoteUrl,
} from './vcs-ops/remote-ops';
import {
  ensureBranchAtCommit,
  resolveCurrentBranch,
  suggestPushBranchForCommit,
} from './vcs-ops/push-helpers';
import type {
  Bookmark,
  ChangeEntry,
  FileDiffEntry,
  OperationEntry,
  PushPreview,
  Remote,
  SyncResult,
  WorkingCopyStatus,
} from '@sero-ai/common';
import { WORKING_TREE_REV } from '@sero-ai/common';

/** git's well-known empty tree object — the base every root commit diffs against. */
const EMPTY_TREE_REV = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export class VcsOps {
  constructor(private readonly runner: GitRunner) {}

  async getLogEntries(
    workspaceId: string,
    limit = 40,
    revset?: string,
  ): Promise<ChangeEntry[]> {
    const args = ['log', `--format=${LOG_FORMAT}`, `--max-count=${limit}`];
    if (revset) args.push(revset);

    const result = await this.runner.run(workspaceId, args);
    if (result.exitCode !== 0) {
      // Empty repo — no commits yet
      if (result.stderr.includes('does not have any commits')) return [];
      throw new Error(result.stderr || 'Failed to load commit log');
    }
    return parseLogEntries(result.stdout);
  }

  async getStatus(workspaceId: string): Promise<WorkingCopyStatus> {
    const result = await this.runner.run(workspaceId, ['status', '--porcelain']);
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Failed to get status');
    return parseStatus(result.stdout);
  }

  async getFileDiffSummary(
    workspaceId: string,
    from: string,
    to?: string,
  ): Promise<FileDiffEntry[]> {
    const fromRev = await this.resolveDiffBase(workspaceId, from);
    if (to && to !== WORKING_TREE_REV) {
      const result = await this.runner.run(workspaceId, ['diff', '--name-status', `${fromRev}..${to}`]);
      if (result.exitCode !== 0) throw new Error(result.stderr || 'Failed to get diff summary');
      return parseDiffSummary(result.stdout);
    }
    return this.getWorkingTreeDiffSummary(workspaceId, fromRev);
  }

  /**
   * Diff a commit against the working tree. `git diff <rev>` alone misses
   * untracked files, so merge them in from `git status` (`-uall` expands
   * untracked directories into their files).
   */
  private async getWorkingTreeDiffSummary(
    workspaceId: string,
    fromRev: string,
  ): Promise<FileDiffEntry[]> {
    const [diff, status] = await Promise.all([
      this.runner.run(workspaceId, ['diff', '--name-status', fromRev]),
      this.runner.run(workspaceId, ['status', '--porcelain', '-uall']),
    ]);
    if (diff.exitCode !== 0) throw new Error(diff.stderr || 'Failed to get diff summary');
    if (status.exitCode !== 0) throw new Error(status.stderr || 'Failed to get status');

    const entries = parseDiffSummary(diff.stdout);
    const seen = new Set(entries.map((entry) => entry.path));
    for (const file of parseStatus(status.stdout).files) {
      if (seen.has(file.path)) continue;
      entries.push({ path: file.path, status: file.status, oldPath: file.oldPath });
    }
    return entries;
  }

  /**
   * Resolve the base revision of a diff. A root commit has no parent, so
   * `<rev>^` doesn't resolve — fall back to git's empty tree, which diffs
   * the first commit as all-added.
   */
  private async resolveDiffBase(workspaceId: string, rev: string): Promise<string> {
    const result = await this.runner.run(workspaceId, [
      'rev-parse',
      '--verify',
      '--quiet',
      `${rev}^{commit}`,
    ]);
    return result.exitCode === 0 ? rev : EMPTY_TREE_REV;
  }

  async getFileContent(
    workspaceId: string,
    revset: string,
    path: string,
  ): Promise<string> {
    const result = await this.runner.run(
      workspaceId,
      ['show', `${revset}:${path}`],
      60_000,
    );
    if (result.exitCode !== 0) {
      // File might not exist at this revision — return empty
      if (result.stderr.includes('does not exist') || result.stderr.includes('not exist in')) return '';
      throw new Error(result.stderr || 'Failed to read file at revision');
    }

    return result.stdout;
  }

  async describeChange(
    workspaceId: string,
    changeId: string,
    message: string,
  ): Promise<void> {
    // Git can only amend the HEAD commit's message directly.
    const head = await this.runner.run(workspaceId, ['rev-parse', '--short', 'HEAD']);
    const headSha = head.stdout.trim();

    if (!headSha.startsWith(changeId.slice(0, headSha.length))) {
      throw new Error('Can only edit the description of the most recent commit (HEAD)');
    }

    const result = await this.runner.run(workspaceId, [
      'commit',
      '--amend',
      '-m',
      message,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to update commit message');
    }
  }

  async listBookmarks(workspaceId: string): Promise<Bookmark[]> {
    return listBookmarks(this.runner, workspaceId);
  }

  async createBookmark(
    workspaceId: string,
    name: string,
    revision = 'HEAD',
  ): Promise<void> {
    return createBookmark(this.runner, workspaceId, name, revision);
  }

  async deleteBookmark(workspaceId: string, name: string): Promise<void> {
    return deleteBookmark(this.runner, workspaceId, name);
  }

  async moveBookmark(
    workspaceId: string,
    name: string,
    toRevision: string,
  ): Promise<void> {
    return moveBookmark(this.runner, workspaceId, name, toRevision);
  }

  async listRemotes(workspaceId: string): Promise<Remote[]> {
    return listRemotes(this.runner, workspaceId);
  }

  async addRemote(
    workspaceId: string,
    name: string,
    url: string,
  ): Promise<void> {
    return addRemote(this.runner, workspaceId, name, url);
  }

  async removeRemote(workspaceId: string, name: string): Promise<void> {
    return removeRemote(this.runner, workspaceId, name);
  }

  /** Update the URL of an existing remote. */
  async setRemoteUrl(workspaceId: string, name: string, url: string): Promise<void> {
    return setRemoteUrl(this.runner, workspaceId, name, url);
  }

  async checkoutRemote(workspaceId: string, remote?: string): Promise<SyncResult> {
    return checkoutRemote(this.runner, workspaceId, remote);
  }

  async fetch(workspaceId: string, remote?: string): Promise<SyncResult> {
    const args = ['fetch'];
    if (remote) args.push(remote);
    else args.push('--all');

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
    let resolvedBranch = bookmark;
    if (!resolvedBranch && changeId) {
      try {
        const bookmarks = await listBookmarks(this.runner, workspaceId);
        resolvedBranch = await suggestPushBranchForCommit(this.runner, workspaceId, changeId, bookmarks);
      } catch (err) {
        console.warn('[vcs-ops] Dry-run branch suggestion failed (best-effort):', err);
      }
    }

    const pushRemote = await resolvePushRemote(this.runner, workspaceId);
    const args = ['push', '--dry-run'];
    if (pushRemote) args.push(pushRemote);
    if (resolvedBranch) args.push(resolvedBranch);

    const result = await this.runner.run(workspaceId, args, 60_000);
    const output = result.stdout + '\n' + result.stderr;

    return {
      bookmarks: resolvedBranch ? [resolvedBranch] : [],
      willCreate: [],
      message: output.trim(),
    };
  }

  async push(
    workspaceId: string,
    bookmark?: string,
    changeId?: string,
  ): Promise<SyncResult> {
    let resolvedBranch = bookmark;
    if (resolvedBranch && changeId) {
      try {
        await ensureBranchAtCommit(this.runner, workspaceId, resolvedBranch, changeId);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to set push branch',
        };
      }
    }
    if (!resolvedBranch && changeId) {
      try {
        const bookmarks = await listBookmarks(this.runner, workspaceId);
        resolvedBranch = await suggestPushBranchForCommit(this.runner, workspaceId, changeId, bookmarks);
        await ensureBranchAtCommit(this.runner, workspaceId, resolvedBranch, changeId);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to prepare push branch',
        };
      }
    }

    // When no branch was specified at all, resolve the current branch
    // so `git push -u origin <branch>` works on first push.
    if (!resolvedBranch) {
      resolvedBranch = await resolveCurrentBranch(this.runner, workspaceId);
    }

    const pushRemote = await resolvePushRemote(this.runner, workspaceId);
    const args = ['push', '-u'];
    if (pushRemote) args.push(pushRemote);
    if (resolvedBranch) args.push(resolvedBranch);

    const result = await this.runner.run(workspaceId, args, 120_000);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Push failed' };
    }

    const output = result.stderr || result.stdout;
    if (resolvedBranch) {
      const summary = `Pushed branch '${resolvedBranch}'`;
      return {
        success: true,
        message: output?.trim() ? `${summary}\n${output.trim()}` : summary,
      };
    }

    return { success: true, message: output || 'Push complete' };
  }

  async undo(workspaceId: string): Promise<void> {
    // Undo last commit by soft-resetting to HEAD~1 (keeps changes staged)
    const result = await this.runner.run(workspaceId, ['reset', '--soft', 'HEAD~1']);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Undo failed — no commits to undo');
    }
  }

  async abandon(workspaceId: string, changeId: string): Promise<void> {
    // "Abandon" = drop a commit. Only supported for HEAD in a non-interactive flow.
    const head = await this.runner.run(workspaceId, ['rev-parse', '--short', 'HEAD']);
    const headSha = head.stdout.trim();

    if (!headSha.startsWith(changeId.slice(0, headSha.length))) {
      throw new Error('Can only drop the most recent commit (HEAD). Use interactive rebase for older commits.');
    }

    const result = await this.runner.run(workspaceId, ['reset', '--hard', 'HEAD~1']);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to drop commit ${changeId}`);
    }
  }

  async squash(
    workspaceId: string,
    from?: string,
    into?: string,
  ): Promise<void> {
    void from;
    void into;

    const soft = await this.runner.run(workspaceId, ['reset', '--soft', 'HEAD~1']);
    if (soft.exitCode !== 0) {
      throw new Error(soft.stderr || 'Squash failed — cannot reset');
    }

    const amend = await this.runner.run(workspaceId, ['commit', '--amend', '--no-edit']);
    if (amend.exitCode !== 0) {
      throw new Error(amend.stderr || 'Squash failed — cannot amend');
    }
  }

  async getOperationLog(
    workspaceId: string,
    limit = 20,
  ): Promise<OperationEntry[]> {
    const result = await this.runner.run(workspaceId, [
      'reflog',
      `--format=${REFLOG_FORMAT}`,
      '-n',
      String(limit),
    ]);
    if (result.exitCode !== 0) {
      return [];
    }

    return parseReflog(result.stdout);
  }
}
