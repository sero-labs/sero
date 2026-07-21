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
import { resolveStatePath } from '@electron/features/vcs/git-service/state-io';
import { refreshGitState, runGitAction } from '@electron/features/vcs/git-service/git-service';
import { gitWorkspaceStateManager } from './manager';

export function registerGitServiceBridge(): void {
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
