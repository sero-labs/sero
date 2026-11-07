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
import { RUNTIME_WORKSPACE_PATH } from '@electron/features/workspace/runtime/runtime-paths';
import { gitRunner } from '@electron/shared/infra/singletons';
import { setGitExecutionRouter } from '@electron/features/git/git-service/git-exec';
import { resolveStatePath } from '@electron/features/git/git-service/state-io';
import { refreshGitState, runGitAction } from '@electron/features/git/git-service/git-service';
import { gitWorkspaceStateManager } from './manager';

interface GitWorkspace {
  id: string;
  path: string;
}

/**
 * The workspace a git call belongs to.
 *
 * A session in a container workspace hands over that runtime's path
 * (`/workspace`), which matches no host path, so the call used to fall through to
 * host execution at `/workspace` and report an empty repository: no branch, no
 * commits, "Not a git repository". Map the runtime path back through the
 * workspaces whose runtime is not the host.
 *
 * More than one such workspace is a real ambiguity — their runtime paths are all
 * `/workspace` — so fall through rather than pick one.
 */
async function workspaceForGitPath(cwd: string): Promise<GitWorkspace | null> {
  const direct = workspaceManager.findByPath(cwd);
  if (direct) return { id: direct.id, path: direct.path };
  const inRuntimeRoot = cwd === RUNTIME_WORKSPACE_PATH || cwd.startsWith(`${RUNTIME_WORKSPACE_PATH}/`);
  if (!inRuntimeRoot) return null;
  const candidates: GitWorkspace[] = [];
  for (const workspace of await workspaceManager.list()) {
    const runtime = await runtimeManager.getRuntime(workspace.id);
    if (runtime.backend === 'host') continue;
    candidates.push({ id: workspace.id, path: workspace.path });
  }
  if (candidates.length !== 1) return null;
  return candidates[0] ?? null;
}

export function registerGitServiceBridge(): void {
  // Repos of container/remote workspaces execute inside their runtime
  // backend (auth-injected, correct git + path mapping); host workspaces and
  // non-workspace paths (card worktrees) execute directly on the host.
  setGitExecutionRouter(async (args, cwd, { timeout, env }) => {
    const workspace = await workspaceForGitPath(cwd);
    if (!workspace) return null;
    const runtime = await runtimeManager.getRuntime(workspace.id);
    if (runtime.backend === 'host') return null;
    return gitRunner.runWithEnv(workspace.id, args, env ?? {}, timeout);
  });
  setGitServiceBridge({
    async runAction(params, cwd) {
      const workspace = await workspaceForGitPath(cwd);
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
