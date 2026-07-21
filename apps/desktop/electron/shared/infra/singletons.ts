import path from 'path';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import type { ContainerConfig } from '@electron/features/container/core/types';
import { containerManager } from '@electron/features/container/core/singleton';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { GatewayServer } from '@electron/features/gateway';
import { WebChatServer } from '@electron/features/gateway/channels/web';
import { TailscaleIntegration } from '@electron/features/gateway/bridge/tailscale';
import { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { FileWatcherManager } from '@electron/features/workspace/watcher';
import { LspManager } from '@electron/features/editor/lsp/lsp-manager';
import { GitRunner, VcsManager, VcsOps, VcsPullRequestOps } from '@electron/features/vcs';
import { setWorktreeGitHubAuth } from '@electron/features/vcs/worktree/exec';
import { GitHubRepoOps } from '@electron/features/vcs/github/repos';
import { ArtifactRegistry } from '@electron/features/container/registries/artifact-registry';
import { subagentManager } from '@electron/features/subagent/singleton';
import { appRuntimeManager } from '@electron/features/apps/runtime/manager';
import { pluginDevSessionManager } from '@electron/features/plugins/dev-sessions/manager';

export const githubAuth = new GitHubAuthManager();

export { containerManager };

// Wire GitHub auth env vars into container exec so GH_TOKEN + git
// credential config are available in every container command.
containerManager.getExtraEnvVars = () => githubAuth.getAuthEnvVars();

// Path-addressed worktree git/gh (background loops, Agent Board) gets the
// same auth injection as workspace-routed execution.
setWorktreeGitHubAuth(githubAuth);

const gitRunner = new GitRunner(workspaceManager, runtimeManager, githubAuth);
export const vcsManager = new VcsManager(workspaceManager, gitRunner);
export const vcsOps = new VcsOps(gitRunner);
export const vcsPrOps = new VcsPullRequestOps(gitRunner);
export const githubRepoOps = new GitHubRepoOps(gitRunner, workspaceManager);

export const artifactRegistry = new ArtifactRegistry();

const GATEWAY_PORT = 18800;
const WEB_CHAT_PORT = 18801;
const GATEWAY_PREVIEW_PORT = 18802;
const GATEWAY_PREVIEW_TLS_PORT = 8443;
const GATEWAY_TOKEN_PATH = path.join(SERO_AGENT_DIR, 'gateway-token');

export const gatewayServer = new GatewayServer({
  port: GATEWAY_PORT,
  previewPort: GATEWAY_PREVIEW_PORT,
  previewTlsPort: GATEWAY_PREVIEW_TLS_PORT,
  host: '127.0.0.1',
  tokenPath: GATEWAY_TOKEN_PATH,
  configDir: SERO_AGENT_DIR,
});

export const webChatServer = new WebChatServer({
  port: WEB_CHAT_PORT,
  host: '127.0.0.1',
  gatewayWsUrl: `ws://127.0.0.1:${GATEWAY_PORT}`,
});

export const tailscale = new TailscaleIntegration();

export { workspaceManager, runtimeManager };

export const fileWatcherManager = new FileWatcherManager();

export const lspManager = new LspManager(runtimeManager);

export { subagentManager, appRuntimeManager, pluginDevSessionManager };

/**
 * Build the standard ContainerConfig for a workspace.
 *
 * Centralises mount configuration so every call site (agent sessions,
 * container IPC, VCS runner) gets the same mounts.
 *
 * By default, containers run in **isolated** mode — only the workspace's
 * own files are mounted. To grant access to another workspace's files,
 * add it as a reference via `WorkspaceManager.addReference()`. The
 * referenced workspace's directory is then mounted read-write.
 *
 * Pass `opts.isolated` to force full isolation even when references
 * exist (used by kanban subagents).
 */
export async function buildContainerConfig(
  workspaceId: string,
  hostPath: string,
  opts?: { isolated?: boolean },
): Promise<ContainerConfig> {
  return buildWorkspaceContainerConfig(workspaceManager, workspaceId, hostPath, opts);
}
