/**
 * What the model is shown when it drafts a commit message.
 *
 * The two surfaces that offer the sparkle commit different things, so the draft
 * has to describe the same set: the Git app commits what is **staged**, and the
 * titlebar popover has one list and commits **all** of it (§5). Drafting from
 * the wrong set writes a plausible message about changes the commit will not
 * contain, which is invisible until someone reads the history back.
 */

import type { GitRunner } from './git-runner';

/** Same ceiling as the PR draft — beyond this the model gains nothing. */
const DIFF_PATCH_LIMIT = 32_000;

export type CommitDraftScope = 'staged' | 'all';

export interface CommitDraftContext {
  fileSummary: string;
  patch: string;
}

export async function buildCommitDraftContext(
  runner: GitRunner,
  workspaceId: string,
  scope: CommitDraftScope,
): Promise<CommitDraftContext> {
  const [fileSummary, patch] = await Promise.all([
    scope === 'staged'
      ? nameStatus(runner, workspaceId, ['diff', '--cached', '--name-status', '-M'])
      : porcelainSummary(runner, workspaceId),
    diffPatch(runner, workspaceId, scope),
  ]);

  if (!fileSummary) {
    throw new Error(
      scope === 'staged'
        ? 'Nothing is staged, so there is nothing to describe.'
        : 'Nothing has changed, so there is nothing to describe.',
    );
  }
  return { fileSummary, patch };
}

async function diffPatch(
  runner: GitRunner,
  workspaceId: string,
  scope: CommitDraftScope,
): Promise<string> {
  const args = scope === 'staged'
    ? ['diff', '--cached', '-M']
    // Against HEAD so staged and unstaged work appear together, which is the
    // set the popover commits. An unborn repo has no HEAD, and `git diff`
    // alone is the closest thing it has.
    : (await hasHead(runner, workspaceId)) ? ['diff', 'HEAD', '-M'] : ['diff'];

  const result = await runner.run(workspaceId, args, 120_000);
  if (result.exitCode !== 0) return '';

  const patch = result.stdout.trim();
  if (patch.length <= DIFF_PATCH_LIMIT) return patch;
  return `${patch.slice(0, DIFF_PATCH_LIMIT)}\n\n...[patch truncated]`;
}

async function hasHead(runner: GitRunner, workspaceId: string): Promise<boolean> {
  const result = await runner.run(workspaceId, ['rev-parse', '--verify', 'HEAD']);
  return result.exitCode === 0;
}

async function nameStatus(
  runner: GitRunner,
  workspaceId: string,
  args: string[],
): Promise<string> {
  const result = await runner.run(workspaceId, args);
  if (result.exitCode !== 0) return '';
  return result.stdout.trim();
}

/**
 * Porcelain rather than `git diff --name-status`, because the whole point of
 * the `all` scope is that it includes files git has never seen — and a new file
 * is exactly the one the model most needs to know about.
 */
async function porcelainSummary(runner: GitRunner, workspaceId: string): Promise<string> {
  const result = await runner.run(workspaceId, ['status', '--porcelain=v1']);
  if (result.exitCode !== 0) return '';

  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const code = line.slice(0, 2);
      const filePath = line.slice(3);
      return `${code === '??' ? 'A' : code.trim()}\t${filePath}`;
    })
    .join('\n');
}
