/**
 * Registers the host git-service bridge that the sero-git-plugin extension
 * resolves at runtime (extensions run in this process; see
 * @sero-ai/common git-service-bridge).
 *
 * Actions on a registered workspace go through the state manager so refresh
 * invalidation and freshness windows apply; other paths (e.g. card worktrees)
 * run the service directly against the path.
 */

import { setGitServiceBridge } from '@sero-ai/common';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { gitRunner } from '@electron/shared/infra/singletons';
import { setGitExecutionRouter } from '@electron/features/git/git-service/git-exec';
import { resolveStatePath } from '@electron/features/git/git-service/state-io';
import { refreshGitState, runGitAction } from '@electron/features/git/git-service/git-service';
import { gitWorkspaceStateManager } from './manager';

export function registerGitServiceBridge(): void {
  // Repos of container/remote workspaces execute inside their runtime
  // backend (auth-injected, correct git + path mapping); host workspaces and
  // non-workspace paths (card worktrees) execute directly on the host.
  setGitExecutionRouter(async (args, cwd, { timeout, env }) => {
    const workspace = workspaceManager.findByPath(cwd);
    if (!workspace) return null;
    const runtime = await runtimeManager.getRuntime(workspace.id);
    if (runtime.backend === 'host') return null;
    return gitRunner.runWithEnv(workspace.id, args, env ?? {}, timeout);
  });
  setGitServiceBridge({
    async runAction(params, cwd) {
      const workspace = workspaceManager.findByPath(cwd);
      if (workspace) {
        return gitWorkspaceStateManager.runWorkspaceAction(workspace.id, params);
      }
      return runGitAction(params, cwd, resolveStatePath(cwd));
    },

    async syncState(cwd) {
      const workspace = workspaceManager.findByPath(cwd);
      if (workspace) {
        await gitWorkspaceStateManager.refreshWorkspace(workspace.id);
        return;
      }
      await refreshGitState(cwd, resolveStatePath(cwd));
    },
  });
}
