/**
 * Shared AI infrastructure — lazy-initialised singletons.
 *
 * Used by both the agent pool (chat sessions) and the app agent pool
 * (per-app background sessions). Ensures we have a single AuthStorage,
 * ModelRegistry, SettingsManager, and default model across the app.
 */

import {
  SettingsManager,
  AuthStorage,
  ModelRegistry,
} from '@mariozechner/pi-coding-agent';
import { getModel, type Model, type Api } from '@mariozechner/pi-ai';
import os from 'os';
import path from 'path';

// ── Shared state ─────────────────────────────────────────────

let _authStorage: AuthStorage | null = null;
let _modelRegistry: ModelRegistry | null = null;
let _settingsManager: ReturnType<typeof SettingsManager.create> | null = null;
let _model: Model<Api> | null = null;

/**
 * PI's standard agent directory — source of truth for auth, settings,
 * extensions, skills, prompts, packages, and models.
 */
export const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');

/** Sero-specific session storage. */
export const SERO_SESSION_DIR = path.join(os.homedir(), '.sero-ui', 'agent', 'sessions');

/** Sero config file — user-editable settings specific to Sero. */
export const SERO_CONFIG_PATH = path.join(os.homedir(), '.sero-ui', 'agent', 'settings.json');

export interface SharedInfra {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: ReturnType<typeof SettingsManager.create>;
  model: Model<Api>;
}

/** Lazy-init shared infrastructure. Called once, then cached. */
export async function ensureInfra(): Promise<SharedInfra> {
  if (!_authStorage) {
    _authStorage = new AuthStorage(path.join(PI_AGENT_DIR, 'auth.json'));
    _modelRegistry = new ModelRegistry(_authStorage);
    _settingsManager = SettingsManager.create(
      path.join(os.homedir(), '.sero-ui'),
      PI_AGENT_DIR,
    );
    _model = getModel('anthropic', 'claude-opus-4-6');
    if (!_model) throw new Error('Model claude-opus-4-6 not found in registry');
  }

  return {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model!,
  };
}
