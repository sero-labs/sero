/**
 * GitHub repository operations — create repos via `gh` CLI.
 *
 * Uses GitRunner to run `gh repo create` either in a container or on the host,
 * with GitHub auth env vars automatically injected.
 */

import type { GitRunner } from '../vcs/git-runner';
import type { CreateGitHubRepoInput, CreateGitHubRepoResult } from '../../src/types/ipc';

export class GitHubRepoOps {
  constructor(private readonly runner: GitRunner) {}

  /**
   * Create a GitHub repository and optionally add it as the 'origin' remote.
   *
   * Uses `gh repo create <name> --<visibility>` to create the repo on GitHub.
   * If `addRemote` is true (default), sets the new repo as the workspace's
   * 'origin' remote — skipped if 'origin' already exists.
   */
  async createRepo(
    workspaceId: string,
    input: CreateGitHubRepoInput,
  ): Promise<CreateGitHubRepoResult> {
    const name = input.name.trim();
    if (!name) {
      return { success: false, message: 'Repository name is required.' };
    }

    // Validate name format (GitHub allows alphanumeric, hyphens, underscores, dots)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return {
        success: false,
        message: 'Repository name can only contain letters, numbers, hyphens, underscores, and dots.',
      };
    }

    // Build gh repo create args
    const args = ['repo', 'create', name, `--${input.visibility}`];

    if (input.description?.trim()) {
      args.push('--description', input.description.trim());
    }

    // --source=. tells gh to use the current directory as the local repo
    // and automatically adds the remote
    const addRemote = input.addRemote !== false;
    if (addRemote) {
      args.push('--source=.');
    }

    const result = await this.runner.runCommand(workspaceId, 'gh', args, 60_000);

    if (result.exitCode !== 0) {
      return {
        success: false,
        message: this.formatError(result.stderr, result.stdout),
      };
    }

    const url = extractRepoUrl(result.stdout) ?? extractRepoUrl(result.stderr);

    return {
      success: true,
      message: url
        ? `Repository created: ${url}`
        : 'Repository created successfully.',
      url,
    };
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

function extractRepoUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/github\.com\/[^\s]+/);
  return match?.[0];
}
