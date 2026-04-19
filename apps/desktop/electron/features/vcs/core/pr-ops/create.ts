import type { CreatePullRequestResult } from '@sero-ai/common';

import type { GitRunner } from '../git-runner';

interface CreatePullRequestCommandInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  body: string;
  draft?: boolean;
}

function formatCreatePrError(stderr: string, stdout: string): string {
  const message = (stderr || stdout || 'Failed to create pull request').trim();
  const lower = message.toLowerCase();

  if (lower.includes('enoent') || lower.includes('not found') || lower.includes('cannot run gh')) {
    return "GitHub CLI (`gh`) is not available in this workspace runtime. Install `gh` and retry.";
  }
  if (lower.includes('authentication')) {
    return `${message}\nConnect your GitHub account in Sero Settings → GitHub and retry.`;
  }
  return message;
}

function extractGithubPrUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0];
}

export async function executeCreatePullRequest(
  runner: GitRunner,
  workspaceId: string,
  input: CreatePullRequestCommandInput,
): Promise<CreatePullRequestResult> {
  const args = [
    'pr',
    'create',
    '--head',
    input.sourceBranch,
    '--base',
    input.targetBranch,
    '--title',
    input.title,
    '--body',
    input.body,
  ];
  if (input.draft) args.push('--draft');

  const result = await runner.runCommand(workspaceId, 'gh', args, 120_000);
  if (result.exitCode !== 0) {
    return {
      success: false,
      message: formatCreatePrError(result.stderr, result.stdout),
    };
  }

  const url = extractGithubPrUrl(result.stdout) ?? extractGithubPrUrl(result.stderr);
  return {
    success: true,
    message: url ? `Pull request created: ${url}` : 'Pull request created successfully.',
    url,
  };
}
