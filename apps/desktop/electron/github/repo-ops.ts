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

    // Validate name format (GitHub allows alphanumeric, hyphens, underscores, dots)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return {
        success: false,
        message: 'Repository name can only contain letters, numbers, hyphens, underscores, and dots.',
      };
    }

    const addRemote = input.addRemote !== false;

    // Check if 'origin' remote already exists
    const existingOrigin = addRemote ? await this.getOriginUrl(workspaceId) : null;

    // Build gh repo create args
    const args = ['repo', 'create', name, `--${input.visibility}`];

    if (input.description?.trim()) {
      args.push('--description', input.description.trim());
    }

    // --source=. tells gh to use the current directory as the local repo
    // and automatically adds the remote. Only use it when there's no
    // existing origin — otherwise gh fails with "remote origin already exists".
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

    // If origin already existed and user wants the remote updated, set-url now.
    if (addRemote && existingOrigin && url) {
      const update = await this.runner.run(workspaceId, ['remote', 'set-url', 'origin', url]);
      if (update.exitCode !== 0) {
        return {
          success: false,
          message: `Repository created on GitHub, but failed to update local origin.\n${update.stderr || update.stdout || 'git remote set-url failed'}`,
          url,
        };
      }
    }

    return {
      success: true,
      message: url
        ? `Repository created: ${url}`
        : 'Repository created successfully.',
      url,
    };
  }

  /** Get the current 'origin' remote URL, or null if none exists. */
  private async getOriginUrl(workspaceId: string): Promise<string | null> {
    const result = await this.runner.run(workspaceId, ['remote', 'get-url', 'origin']);
    if (result.exitCode !== 0) return null;
    const url = result.stdout.trim();
    return url || null;
  }

  private async resolveCreatedRepoUrl(
    workspaceId: string,
    name: string,
    stdout: string,
    stderr: string,
  ): Promise<string | undefined> {
    const direct = extractRepoUrl(stdout) ?? extractRepoUrl(stderr);
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
  // Exclude trailing punctuation (periods, commas, parens) that may come from
  // natural-language output wrapping the URL.
  const match = text.match(/https:\/\/github\.com\/[^\s,.)]+/);
  return match?.[0];
}

function normalizeGitHubRemoteUrl(url: string | null): string | undefined {
  if (!url) return undefined;

  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return undefined;
}
