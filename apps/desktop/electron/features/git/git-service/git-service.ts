/**
 * Shared Git service logic used by both the Pi extension and the desktop host.
 */

import type { GitActionResult, GitManagerRequest } from '@sero-ai/common';
import {
  createGitActionContext,
  formatActionError,
  refreshGitState,
  type GitRefreshOptions,
} from './git-service-core';
import { runGitMutationAction } from './git-service-mutation-actions';
import { runGitQueryAction } from './git-service-query-actions';

export type { GitActionResult };
export { refreshGitState };

export async function runGitAction(
  params: GitManagerRequest,
  cwd: string,
  statePath: string,
  options: GitRefreshOptions = {},
): Promise<GitActionResult> {
  const context = createGitActionContext(cwd, statePath, options);

  try {
    return (
      await runGitQueryAction(params, context) ??
      await runGitMutationAction(params, context) ??
      { ok: false, message: `Unknown action: ${params.action}` }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: formatActionError(params.action, message) };
  }
}
