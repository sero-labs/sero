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
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { type Api, type Model } from '@earendil-works/pi-ai';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { migrateLegacyProfileRootConfigsSync } from '@electron/features/profile/agent-config-migration';
import { applyRuntimeSettings, pickFirstAvailableModel } from './runtime-settings';
import {
  appRuntimeManager,
  artifactRegistry,
  buildContainerConfig,
  containerManager,
  fileWatcherManager,
  gatewayServer,
  githubAuth,
  githubRepoOps,
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

let _authStorage: AuthStorage | null = null;
let _modelRegistry: ModelRegistry | null = null;
let _settingsManager: ReturnType<typeof SettingsManager.create> | null = null;
let _model: Model<Api> | null = null;
let _containerProxyStarted = false;

/** Sero session storage. */
export const SERO_SESSION_DIR = `${SERO_AGENT_DIR}/sessions`;

/** Sero config file — user-editable settings. */
export const SERO_CONFIG_PATH = `${SERO_AGENT_DIR}/settings.json`;

export interface SharedInfra {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  model: Model<Api> | null;
}

export { applyRuntimeSettings };

export function refreshInfraModelSelection(): Model<Api> | null {
  if (!_modelRegistry || !_settingsManager) return _model;
  _model = pickFirstAvailableModel(_modelRegistry, _settingsManager);
  return _model;
}

/** Lazy-init shared infrastructure. Called once, then cached. */
export async function ensureInfra(): Promise<SharedInfra> {
  if (!_authStorage) {
    _authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    _modelRegistry = ModelRegistry.create(_authStorage, `${SERO_AGENT_DIR}/models.json`);
    _settingsManager = SettingsManager.create(
      SERO_AGENT_DIR,
      SERO_AGENT_DIR,
    );
    // Default to 'high' thinking if the user hasn't explicitly set a level
    if (!_settingsManager.getDefaultThinkingLevel()) {
      _settingsManager.setDefaultThinkingLevel('high');
    }
    refreshInfraModelSelection();
  }

  const infra = {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model,
  };

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
