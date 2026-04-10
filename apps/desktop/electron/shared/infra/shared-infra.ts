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
  SettingsManager,
  AuthStorage,
  ModelRegistry,
} from '@mariozechner/pi-coding-agent';
import { type Model, type Api } from '@mariozechner/pi-ai';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import { getConfiguredModelFallbackChain } from '../settings/model-fallback-chain';
import { getModelTiers } from '../settings/model-tiers';
import type { ContainerConfig } from '@electron/features/container/core/types';
import { containerManager } from '@electron/features/container/core/singleton';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { GatewayServer } from '@electron/features/gateway';
import { WebChatServer } from '@electron/features/gateway/channels/web';
import { TailscaleIntegration } from '@electron/features/gateway/bridge/tailscale';
import { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { FileWatcherManager } from '@electron/features/workspace/watcher';
import { LspManager } from '@electron/features/editor/lsp/lsp-manager';
import { GitRunner, VcsManager, VcsOps, VcsPullRequestOps } from '@electron/features/vcs';
import { GitHubRepoOps } from '@electron/features/auth/github/repo-ops';
import { ArtifactRegistry } from '@electron/features/container/registries/artifact-registry';
import { migrateLegacyProfileRootConfigsSync } from '@electron/features/profile/agent-config-migration';

if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  migrateLegacyProfileRootConfigsSync(
    path.dirname(SERO_AGENT_DIR),
    SERO_AGENT_DIR,
  );
}

// ── GitHub Auth Manager (singleton) ──────────────────────────

export const githubAuth = new GitHubAuthManager();

// ── Container Manager (singleton) ────────────────────────────
export { containerManager };

// Wire GitHub auth env vars into container exec so GH_TOKEN + git
// credential config are available in every container command.
containerManager.getExtraEnvVars = () => githubAuth.getAuthEnvVars();

const gitRunner = new GitRunner(workspaceManager, containerManager, githubAuth);
export const vcsManager = new VcsManager(workspaceManager, gitRunner);
export const vcsOps = new VcsOps(gitRunner);
export const vcsPrOps = new VcsPullRequestOps(gitRunner);
export const githubRepoOps = new GitHubRepoOps(gitRunner, workspaceManager);

// ── Artifact Registry (singleton) ────────────────────────────

export const artifactRegistry = new ArtifactRegistry();

// ── Gateway (singleton) ──────────────────────────────────────

const GATEWAY_PORT = 18800;
const WEB_CHAT_PORT = 18801;
const GATEWAY_TOKEN_PATH = path.join(SERO_AGENT_DIR, 'gateway-token');

export const gatewayServer = new GatewayServer({
  port: GATEWAY_PORT,
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

// ── Workspace Manager (re-export singleton) ──────────────────

export { workspaceManager };

// ── File Watcher Manager (singleton) ─────────────────────────

export const fileWatcherManager = new FileWatcherManager();

// ── LSP Manager (singleton) ─────────────────────────────────

export const lspManager = new LspManager(containerManager);

// ── Subagent Manager (singleton) ─────────────────────────────

import { SubagentManager } from '@electron/features/subagent';

export const subagentManager = new SubagentManager();

// ── Kanban Orchestrator (singleton) ──────────────────────────

import { KanbanOrchestrator } from '@electron/features/kanban';

export const kanbanOrchestrator = new KanbanOrchestrator();

// ── Shared state ─────────────────────────────────────────────

let _authStorage: AuthStorage | null = null;
let _modelRegistry: ModelRegistry | null = null;
let _settingsManager: ReturnType<typeof SettingsManager.create> | null = null;
let _model: Model<Api> | null = null;
let _kanbanRecoveryDone = false;

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

/** Apply runtime-only settings that need to update live singletons. */
export function applyRuntimeSettings(
  settingsManager: ReturnType<typeof SettingsManager.create>,
): void {
  const raw = (settingsManager.getGlobalSettings() as Record<string, unknown>)?.subagent as Record<string, unknown> | undefined;

  subagentManager.updateSettings({
    maxConcurrent: typeof raw?.maxConcurrent === 'number' ? raw.maxConcurrent : undefined,
    maxTotal: typeof raw?.maxTotal === 'number' ? raw.maxTotal : undefined,
    timeoutMs: typeof raw?.timeoutMs === 'number' ? raw.timeoutMs : undefined,
    model: typeof raw?.model === 'string' ? raw.model : undefined,
    thinking: typeof raw?.thinking === 'string' ? raw.thinking : undefined,
  });
}

/**
 * Pick the first available model using tier settings, then fallback chain.
 * Returns null if no model is available (no auth configured yet).
 */
function pickFirstAvailableModel(
  registry: ModelRegistry,
  settingsManager: ReturnType<typeof SettingsManager.create>,
): Model<Api> | null {
  const available = registry.getAvailable();
  if (available.length === 0) return null;

  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;

  // Try HIGH tier model first (most capable, used for main sessions)
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const match = available.find(
      (m) => m.provider === tiers.HIGH!.provider && m.id === tiers.HIGH!.modelId,
    );
    if (match) return match;
  }

  // Try fallback chain
  const chain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of chain) {
    const match = available.find((m) => m.id === candidate);
    if (match) return match;
  }

  // Last resort: first available model
  return available[0] ?? null;
}

/** Lazy-init shared infrastructure. Called once, then cached. */
export async function ensureInfra(): Promise<SharedInfra> {
  if (!_authStorage) {
    _authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    _modelRegistry = new ModelRegistry(_authStorage, `${SERO_AGENT_DIR}/models.json`);
    _settingsManager = SettingsManager.create(
      SERO_AGENT_DIR,
      SERO_AGENT_DIR,
    );
    // Default to 'high' thinking if the user hasn't explicitly set a level
    if (!_settingsManager.getDefaultThinkingLevel()) {
      _settingsManager.setDefaultThinkingLevel('high');
    }
    _model = pickFirstAvailableModel(_modelRegistry, _settingsManager);
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
      containerManager,
    });
  }
  applyRuntimeSettings(infra.settingsManager);

  // Wire kanban orchestrator deps lazily
  kanbanOrchestrator.setDeps({
    subagentManager,
    getWorkspacePath: (wsId) => workspaceManager.getPath(wsId) ?? null,
    findWorkspaceByPath: (absPath) => {
      const entry = workspaceManager.findByPath(absPath);
      return entry ? { id: entry.id, path: entry.path } : null;
    },
  });

  // Recover kanban cards stuck in agent-working after restart (once)
  if (!_kanbanRecoveryDone) {
    _kanbanRecoveryDone = true;
    const allWorkspaces = await workspaceManager.getOpenWorkspaces();
    kanbanOrchestrator.recoverStuckCards(allWorkspaces).catch((err) => {
      console.error('[kanban-orchestrator] Startup recovery failed:', err);
    });
  }

  return infra;
}

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
