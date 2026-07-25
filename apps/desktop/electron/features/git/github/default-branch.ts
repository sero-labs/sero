/** GitHub default-branch read/set — the single implementations. */

import type { GhInvoker } from './invoker';

/** The repo's default branch on GitHub, or null when unavailable. */
export async function getGithubDefaultBranch(gh: GhInvoker): Promise<string | null> {
  try {
    const result = await gh(
      ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'],
      30_000,
    );
    const branch = result.stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
}

/** Set the repo's default branch on GitHub. Throws on failure. */
export async function setGithubDefaultBranch(gh: GhInvoker, branch: string): Promise<void> {
  await gh(['repo', 'edit', '--default-branch', branch], 30_000);
}
