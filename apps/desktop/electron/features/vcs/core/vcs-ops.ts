import type { GitRunner } from './git-runner';
import {
  LOG_FORMAT,
  BRANCH_FORMAT,
  REFLOG_FORMAT,
  parseLogEntries,
  parseStatus,
  parseDiffSummary,
  parseBranches,
  parseRemotes,
  parseReflog,
} from '../support/parsers';
import { isAutoPushBookmark, inferConventionalType, slugifyBranchLabel } from '../support/branch-naming';
import type {
  ChangeEntry,
  WorkingCopyStatus,
  FileDiffEntry,
  Bookmark,
  Remote,
  OperationEntry,
  SyncResult,
  PushPreview,
} from '../../../../src/types/vcs';

const DEFAULT_PRIMARY_BRANCH = 'main';

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
    const args = to
      ? ['diff', '--name-status', `${from}..${to}`]
      : ['diff', '--name-status', from];

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
    const result = await this.runner.run(workspaceId, [
      'branch',
      `--format=${BRANCH_FORMAT}`,
    ]);
    if (result.exitCode !== 0) {
      // No branches yet is fine (empty repo)
      return [];
    }

    return parseBranches(result.stdout);
  }

  async createBookmark(
    workspaceId: string,
    name: string,
    revision = 'HEAD',
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, [
      'branch',
      name,
      revision,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to create branch '${name}'`);
    }
  }

  async deleteBookmark(workspaceId: string, name: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['branch', '-d', name]);
    if (result.exitCode !== 0) {
      // Try force delete
      const force = await this.runner.run(workspaceId, ['branch', '-D', name]);
      if (force.exitCode !== 0) {
        throw new Error(force.stderr || `Failed to delete branch '${name}'`);
      }
    }
  }

  async moveBookmark(
    workspaceId: string,
    name: string,
    toRevision: string,
  ): Promise<void> {
    const result = await this.runner.run(workspaceId, [
      'branch',
      '-f',
      name,
      toRevision,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to move branch '${name}'`);
    }
  }

  async listRemotes(workspaceId: string): Promise<Remote[]> {
    const result = await this.runner.run(workspaceId, ['remote', '-v']);
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
    await this.runner.ensureRepoInitialized(workspaceId);
    const result = await this.runner.run(workspaceId, ['remote', 'add', name, url]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to add remote '${name}'`);
    }
  }

  async removeRemote(workspaceId: string, name: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['remote', 'remove', name]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to remove remote '${name}'`);
    }
  }

  /** Update the URL of an existing remote. */
  async setRemoteUrl(workspaceId: string, name: string, url: string): Promise<void> {
    const result = await this.runner.run(workspaceId, ['remote', 'set-url', name, url]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to update remote URL for '${name}'`);
    }
  }

  private async getCommitDescription(
    workspaceId: string,
    changeId: string,
  ): Promise<string> {
    const result = await this.runner.run(workspaceId, [
      'log',
      '--format=%s',
      '-1',
      changeId,
    ]);

    if (result.exitCode !== 0) return '';
    return result.stdout.trim();
  }

  private async suggestPushBranchForCommit(
    workspaceId: string,
    changeId: string,
    bookmarks: Bookmark[],
  ): Promise<string> {
    // 1. Prefer an existing branch already pointing at this exact commit
    const localAtTarget = bookmarks
      .filter((bm) => bm.isLocal && bm.changeId === changeId)
      .map((bm) => bm.name);

    const preferredAtTarget = localAtTarget.find((name) => name === DEFAULT_PRIMARY_BRANCH)
      ?? localAtTarget.find((name) => !isAutoPushBookmark(name));
    if (preferredAtTarget) return preferredAtTarget;

    // 2. Generate a descriptive feature branch name
    const description = await this.getCommitDescription(workspaceId, changeId);
    const type = inferConventionalType(description);
    const label = slugifyBranchLabel(description);
    return `${type}/${label}-${changeId.slice(0, 8)}`;
  }

  private async ensureBranchAtCommit(
    workspaceId: string,
    branch: string,
    changeId: string,
  ): Promise<void> {
    // Try creating the branch
    const create = await this.runner.run(workspaceId, [
      'branch',
      branch,
      changeId,
    ]);
    if (create.exitCode === 0) return;

    // Branch already exists — force move it
    const move = await this.runner.run(workspaceId, [
      'branch',
      '-f',
      branch,
      changeId,
    ]);

    if (move.exitCode !== 0) {
      throw new Error(move.stderr || `Failed to set branch '${branch}' to ${changeId}`);
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
        const bookmarks = await this.listBookmarks(workspaceId);
        resolvedBranch = await this.suggestPushBranchForCommit(workspaceId, changeId, bookmarks);
      } catch (err) {
        console.warn('[vcs-ops] Dry-run branch suggestion failed (best-effort):', err);
      }
    }

    const pushRemote = await this.resolvePushRemote(workspaceId);
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

  /** Resolve the current branch name (e.g. 'master', 'main'). */
  private async resolveCurrentBranch(workspaceId: string): Promise<string | undefined> {
    const result = await this.runner.run(workspaceId, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = result.exitCode === 0 ? result.stdout.trim() : undefined;
    // HEAD means detached — not a named branch
    return branch && branch !== 'HEAD' ? branch : undefined;
  }

  async push(
    workspaceId: string,
    bookmark?: string,
    changeId?: string,
  ): Promise<SyncResult> {
    let resolvedBranch = bookmark;
    if (resolvedBranch && changeId) {
      try {
        await this.ensureBranchAtCommit(workspaceId, resolvedBranch, changeId);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to set push branch',
        };
      }
    }
    if (!resolvedBranch && changeId) {
      try {
        const bookmarks = await this.listBookmarks(workspaceId);
        resolvedBranch = await this.suggestPushBranchForCommit(workspaceId, changeId, bookmarks);
        await this.ensureBranchAtCommit(workspaceId, resolvedBranch, changeId);
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
      resolvedBranch = await this.resolveCurrentBranch(workspaceId);
    }

    const pushRemote = await this.resolvePushRemote(workspaceId);
    const buildPushArgs = (): string[] => {
      const args = ['push', '-u'];
      if (pushRemote) args.push(pushRemote);
      if (resolvedBranch) args.push(resolvedBranch);
      return args;
    };

    const result = await this.runner.run(workspaceId, buildPushArgs(), 120_000);
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
      `-n`,
      String(limit),
    ]);
    if (result.exitCode !== 0) {
      return [];
    }

    return parseReflog(result.stdout);
  }
}
