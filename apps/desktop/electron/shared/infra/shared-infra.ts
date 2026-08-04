/**
 * Shared AI infrastructure — lazy-initialised singletons.
 *
 * Used by both the agent pool (chat sessions) and the app agent pool
 * (per-app background sessions). Ensures we have a single AuthStorage,
 * ModelRegistry, SettingsManager, and default model across the app.
 *
 * Also exports the ContainerManager singleton used by agent sessions
 * and terminal IPC handlers.
 *
 * All paths resolve under ~/.sero-ui/agent/ — Sero's self-contained
 * agent directory, independent of the Pi CLI's ~/.pi/agent/.
 */

import path from 'path';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { migrateLegacyProfileRootConfigsSync } from '@electron/features/profile/agent-config-migration';
import { applyRuntimeSettings } from './runtime-settings';
import { ensureAiInfra, type SharedInfra } from './ai-infra';
import {
  appRuntimeManager,
  artifactRegistry,
  buildContainerConfig,
  containerManager,
  fileWatcherManager,
  gatewayServer,
  githubAuth,
  githubRepoOps,
  gitRunner,
  lspManager,
  pluginDevSessionManager,
  runtimeManager,
  subagentManager,
  tailscale,
  vcsManager,
  vcsOps,
  vcsPrOps,
  webChatServer,
  workspaceManager,
} from './singletons';

if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  migrateLegacyProfileRootConfigsSync(
    path.dirname(SERO_AGENT_DIR),
    SERO_AGENT_DIR,
  );
}

export {
  appRuntimeManager,
  artifactRegistry,
  buildContainerConfig,
  containerManager,
  fileWatcherManager,
  gatewayServer,
  githubAuth,
  githubRepoOps,
  gitRunner,
  lspManager,
  pluginDevSessionManager,
  runtimeManager,
  subagentManager,
  tailscale,
  vcsManager,
  vcsOps,
  vcsPrOps,
  webChatServer,
  workspaceManager,
};

let _containerProxyStarted = false;

/** Sero session storage. */
export const SERO_SESSION_DIR = `${SERO_AGENT_DIR}/sessions`;

/** Sero config file — user-editable settings. */
export const SERO_CONFIG_PATH = `${SERO_AGENT_DIR}/settings.json`;

export { applyRuntimeSettings };
export { refreshInfraModelSelection, type SharedInfra } from './ai-infra';

/** Lazy-init shared infrastructure. Called once, then cached. */
export async function ensureInfra(): Promise<SharedInfra> {
  const infra = ensureAiInfra();

  // Wire subagent manager deps lazily (avoids circular imports)
  if (!subagentManager.isInitialized) {
    subagentManager.setDeps({
      infra,
      workspaceManager,
    });
  }
  applyRuntimeSettings(infra.settingsManager);
  if (!_containerProxyStarted) {
    _containerProxyStarted = true;
    await containerManager.startProxy();
  }
  await pluginDevSessionManager.initialize();
  await appRuntimeManager.initialize();

  return infra;
}
