/**
 * GitHub repository operations — create repos via `gh` CLI.
 *
 * Uses GitRunner to run `gh repo create` either in a container or on the host,
 * with GitHub auth env vars automatically injected.
 */

import {
  extractGitHubRepoName,
  extractGitHubUrl,
  normalizeGitHubRemoteUrl,
  toGitHubCloneUrl,
} from '@sero-ai/common';
import type { GitRunner } from '@electron/features/vcs/core/git-runner';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { CreateGitHubRepoInput, CreateGitHubRepoResult } from '@/types/ipc';
import { ensureBootstrapGitignore } from '@electron/features/vcs/support/bootstrap-gitignore';

export class GitHubRepoOps {
  constructor(
    private readonly runner: GitRunner,
    private readonly workspaceManager: WorkspaceManager,
  ) {}

  /**
   * Create a GitHub repository and optionally set it as the 'origin' remote.
   *
   * Uses `gh repo create <name> --<visibility>` to create the repo on GitHub.
   * When `addRemote` is true (default):
   * - If no 'origin' remote exists, uses `--source=.` to auto-add it.
   * - If 'origin' already exists, creates the repo without `--source`, then
   *   updates the existing remote URL via `git remote set-url`.
   */
  async createRepo(
    workspaceId: string,
    input: CreateGitHubRepoInput,
  ): Promise<CreateGitHubRepoResult> {
    const name = input.name.trim();
    if (!name) {
      return { success: false, message: 'Repository name is required.' };
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return {
        success: false,
        message: 'Repository name can only contain letters, numbers, hyphens, underscores, and dots.',
      };
    }

    const addRemote = input.addRemote !== false;

    if (addRemote) {
      try {
        await this.runner.ensureRepoInitialized(workspaceId);
        await this.ensureBootstrapCommit(workspaceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Failed to prepare the local repository.\n${message}`,
        };
      }
    }

    const hasLocalCommits = addRemote ? await this.hasLocalCommits(workspaceId) : false;
    const existingOrigin = addRemote ? await this.getOriginUrl(workspaceId) : null;

    const args = ['repo', 'create', name, `--${input.visibility}`];
    if (input.description?.trim()) {
      args.push('--description', input.description.trim());
    }
    if (addRemote && !existingOrigin) {
      args.push('--source=.');
    }

    const result = await this.runner.runCommand(workspaceId, 'gh', args, 60_000);
    if (result.exitCode !== 0) {
      return {
        success: false,
        message: this.formatError(result.stderr, result.stdout),
      };
    }

    const url = await this.resolveCreatedRepoUrl(workspaceId, name, result.stdout, result.stderr);

    if (addRemote) {
      const originSync = await this.syncOriginRemote(workspaceId, name, url);
      if (!originSync.success) {
        return {
          success: false,
          message: `Repository created on GitHub, but failed to configure local origin.\n${originSync.message}`,
          url,
        };
      }
    }

    if (addRemote && hasLocalCommits) {
      const bootstrap = await this.pushInitialBranch(workspaceId);
      if (!bootstrap.success) {
        return {
          success: false,
          message: `Repository created on GitHub, but failed to push the initial branch.\n${bootstrap.message}`,
          url,
        };
      }
    }

    return {
      success: true,
      message: url ? `Repository created: ${url}` : 'Repository created successfully.',
      url,
    };
  }

  private async hasLocalCommits(workspaceId: string): Promise<boolean> {
    const result = await this.runner.run(workspaceId, ['rev-parse', 'HEAD']);
    return result.exitCode === 0;
  }

  /** Get the current 'origin' remote URL, or null if none exists. */
  private async getOriginUrl(workspaceId: string): Promise<string | null> {
    const result = await this.runner.run(workspaceId, ['remote', 'get-url', 'origin']);
    if (result.exitCode !== 0) return null;
    const url = result.stdout.trim();
    return url || null;
  }

  private async ensureBootstrapCommit(workspaceId: string): Promise<void> {
    if (await this.hasLocalCommits(workspaceId)) return;

    const workspacePath = this.workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    await ensureBootstrapGitignore(workspacePath);
    await this.setBootstrapHead(workspaceId, 'main');

    const add = await this.runner.run(workspaceId, ['add', '--', '.gitignore'], 10_000);
    if (add.exitCode !== 0) {
      throw new Error(add.stderr || add.stdout || 'Failed to stage bootstrap .gitignore');
    }

    const commit = await this.runner.run(
      workspaceId,
      ['commit', '--allow-empty', '-m', 'Initial commit'],
      10_000,
    );
    if (commit.exitCode !== 0) {
      throw new Error(commit.stderr || commit.stdout || 'Failed to create bootstrap commit');
    }
  }

  private async setBootstrapHead(workspaceId: string, branch: string): Promise<void> {
    const setHead = await this.runner.run(workspaceId, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
    if (setHead.exitCode === 0) return;

    const rename = await this.runner.run(workspaceId, ['branch', '-M', branch]);
    if (rename.exitCode === 0) return;

    throw new Error(
      rename.stderr
      || rename.stdout
      || setHead.stderr
      || setHead.stdout
      || `Failed to set bootstrap branch '${branch}'.`,
    );
  }

  private async syncOriginRemote(
    workspaceId: string,
    repoName: string,
    repoUrl?: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const currentOrigin = await this.getOriginUrl(workspaceId);
    const cloneUrl = await this.resolveCreatedRepoCloneUrl(workspaceId, repoName, currentOrigin, repoUrl);

    if (!cloneUrl) {
      return {
        success: false,
        message: 'Could not determine the Git clone URL for the new repository.',
      };
    }

    if (!currentOrigin) {
      const add = await this.runner.run(workspaceId, ['remote', 'add', 'origin', cloneUrl], 10_000);
      if (add.exitCode !== 0) {
        return {
          success: false,
          message: add.stderr || add.stdout || 'git remote add origin failed',
        };
      }
      return { success: true };
    }

    if (currentOrigin.trim() === cloneUrl) {
      return { success: true };
    }

    const update = await this.runner.run(workspaceId, ['remote', 'set-url', 'origin', cloneUrl], 10_000);
    if (update.exitCode !== 0) {
      return {
        success: false,
        message: update.stderr || update.stdout || 'git remote set-url origin failed',
      };
    }

    return { success: true };
  }

  private async pushInitialBranch(
    workspaceId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const branch = await this.resolveBootstrapBranch(workspaceId);
    if (!branch) return { success: true };

    const push = await this.runner.run(workspaceId, ['push', '-u', 'origin', branch], 60_000);
    if (push.exitCode !== 0) {
      return {
        success: false,
        message: push.stderr || push.stdout || `Failed to push initial branch '${branch}'.`,
      };
    }

    const edit = await this.runner.runCommand(
      workspaceId,
      'gh',
      ['repo', 'edit', '--default-branch', branch],
      30_000,
    );
    if (edit.exitCode !== 0) {
      console.warn(
        `[github-repo-ops] Failed to set default branch to ${branch}: ${edit.stderr || edit.stdout}`,
      );
    }

    const setHead = await this.runner.run(workspaceId, ['remote', 'set-head', 'origin', branch]);
    if (setHead.exitCode !== 0) {
      console.warn(
        `[github-repo-ops] Failed to set origin/HEAD to ${branch}: ${setHead.stderr || setHead.stdout}`,
      );
    }

    return { success: true };
  }

  private async resolveBootstrapBranch(workspaceId: string): Promise<string | null> {
    const bootstrap = await this.resolveBootstrapBranchCandidate(workspaceId, ['main', 'master'], 0);
    if (bootstrap) return bootstrap;

    const current = await this.runner.run(workspaceId, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (current.exitCode !== 0) return null;
    const branch = current.stdout.trim();
    return branch && branch !== 'HEAD' ? branch : null;
  }

  private async resolveBootstrapBranchCandidate(
    workspaceId: string,
    branches: string[],
    index: number,
  ): Promise<string | null> {
    const branch = branches[index];
    if (!branch) return null;
    const result = await this.runner.run(workspaceId, ['rev-parse', '--verify', branch]);
    if (result.exitCode === 0) return branch;
    return this.resolveBootstrapBranchCandidate(workspaceId, branches, index + 1);
  }

  private async resolveCreatedRepoUrl(
    workspaceId: string,
    name: string,
    stdout: string,
    stderr: string,
  ): Promise<string | undefined> {
    const direct = extractGitHubUrl(stdout) ?? extractGitHubUrl(stderr);
    if (direct) return direct;

    const ghView = await this.runner.runCommand(
      workspaceId,
      'gh',
      ['repo', 'view', name, '--json', 'url', '--jq', '.url'],
      30_000,
    );
    if (ghView.exitCode === 0) {
      const resolved = ghView.stdout.trim();
      if (resolved) return resolved;
    }

    const origin = await this.getOriginUrl(workspaceId);
    return normalizeGitHubRemoteUrl(origin);
  }

  private async resolveCreatedRepoCloneUrl(
    workspaceId: string,
    name: string,
    currentOrigin: string | null,
    repoUrl?: string,
  ): Promise<string | undefined> {
    const direct = toGitHubCloneUrl(repoUrl);
    if (direct) return direct;

    if (extractGitHubRepoName(currentOrigin) === name) {
      const normalizedOrigin = normalizeGitHubCloneUrl(currentOrigin);
      if (normalizedOrigin) return normalizedOrigin;
    }

    return toGitHubCloneUrl(await this.resolveCreatedRepoUrl(workspaceId, name, '', ''));
  }

  private formatError(stderr: string, stdout: string): string {
    const message = (stderr || stdout || 'Failed to create repository').trim();
    const lower = message.toLowerCase();

    if (lower.includes('enoent') || lower.includes('not found') || lower.includes('cannot run gh')) {
      return 'GitHub CLI (`gh`) is not available. Install `gh` and retry.';
    }
    if (lower.includes('authentication') || lower.includes('not logged')) {
      return `${message}\nConnect your GitHub account in the sidebar GitHub login and retry.`;
    }
    if (lower.includes('name already exists') || lower.includes('already exists')) {
      return 'A repository with this name already exists on your GitHub account.';
    }
    return message;
  }
}

function normalizeGitHubCloneUrl(url: string | null): string | undefined {
  return toGitHubCloneUrl(url);
}
