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
import { getModel, type Model, type Api } from '@mariozechner/pi-ai';

import { SERO_AGENT_DIR, SERO_HOME } from '../env';
import type { ContainerConfig } from '../container/types';
import { ContainerManager } from '../container/index';
import { GatewayServer } from '../gateway/index';
import { WebChatServer } from '../gateway/channels/web';
import { TailscaleIntegration } from '../gateway/tailscale';
import { GitHubAuthManager } from '../github/auth-manager';
import { workspaceManager } from '../workspace';
import { FileWatcherManager } from '../file-watcher';
import { LspManager } from '../lsp/lsp-manager';
import { GitRunner, VcsManager, VcsOps, VcsPullRequestOps } from '../vcs';
import { ArtifactRegistry } from '../container/artifact-registry';

// ── GitHub Auth Manager (singleton) ──────────────────────────

export const githubAuth = new GitHubAuthManager();

// ── Container Manager (singleton) ────────────────────────────

export const containerManager = new ContainerManager();

// Wire GitHub auth env vars into container exec so GH_TOKEN + git
// credential config are available in every container command.
containerManager.getExtraEnvVars = () => githubAuth.getAuthEnvVars();

const gitRunner = new GitRunner(workspaceManager, containerManager, githubAuth);
export const vcsManager = new VcsManager(workspaceManager, gitRunner);
export const vcsOps = new VcsOps(gitRunner);
export const vcsPrOps = new VcsPullRequestOps(gitRunner);

// ── Artifact Registry (singleton) ────────────────────────────

export const artifactRegistry = new ArtifactRegistry();

// ── Gateway (singleton) ──────────────────────────────────────

const GATEWAY_PORT = 18800;
const WEB_CHAT_PORT = 18801;
const GATEWAY_TOKEN_PATH = path.join(SERO_HOME, 'gateway-token');

export const gatewayServer = new GatewayServer({
  port: GATEWAY_PORT,
  host: '127.0.0.1',
  tokenPath: GATEWAY_TOKEN_PATH,
  configDir: SERO_HOME,
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

import { SubagentManager } from '../subagent/index';

export const subagentManager = new SubagentManager();

// ── Kanban Orchestrator (singleton) ──────────────────────────

import { KanbanOrchestrator } from '../kanban/index';

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
  model: Model<Api>;
}

/** Lazy-init shared infrastructure. Called once, then cached. */
export async function ensureInfra(): Promise<SharedInfra> {
  if (!_authStorage) {
    _authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
    _modelRegistry = new ModelRegistry(_authStorage);
    _settingsManager = SettingsManager.create(
      SERO_AGENT_DIR,
      SERO_AGENT_DIR,
    );
    // Default to 'high' thinking if the user hasn't explicitly set a level
    if (!_settingsManager.getDefaultThinkingLevel()) {
      _settingsManager.setDefaultThinkingLevel('high');
    }
    _model = getModel('anthropic', 'claude-opus-4-6');
    if (!_model) throw new Error('Model claude-opus-4-6 not found in registry');
  }

  const infra = {
    authStorage: _authStorage,
    modelRegistry: _modelRegistry!,
    settingsManager: _settingsManager!,
    model: _model!,
  };

  // Wire subagent manager deps lazily (avoids circular imports)
  if (!subagentManager.isInitialized) {
    subagentManager.setDeps({
      infra,
      workspaceManager,
      containerManager,
    });

    // Load subagent settings from settings.json
    const raw = (_settingsManager!.getGlobalSettings() as Record<string, unknown>)?.['subagent'] as Record<string, unknown> | undefined;
    if (raw) {
      subagentManager.updateSettings({
        maxConcurrent: typeof raw.maxConcurrent === 'number' ? raw.maxConcurrent : undefined,
        maxTotal: typeof raw.maxTotal === 'number' ? raw.maxTotal : undefined,
        timeoutMs: typeof raw.timeoutMs === 'number' ? raw.timeoutMs : undefined,
        model: typeof raw.model === 'string' ? raw.model : undefined,
        thinking: typeof raw.thinking === 'string' ? raw.thinking : undefined,
      });
    }
  }

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
  let writableMounts: string[] = [];

  if (!opts?.isolated) {
    // Mount explicitly referenced workspaces
    const refs = await workspaceManager.getReferences(workspaceId);
    for (const refId of refs) {
      const refPath = workspaceManager.getPath(refId);
      if (refPath && path.resolve(refPath) !== path.resolve(hostPath)) {
        writableMounts.push(refPath);
      }
    }

    // Mount arbitrary host folders
    const extraMounts = await workspaceManager.getMounts(workspaceId);
    for (const mp of extraMounts) {
      if (path.resolve(mp) !== path.resolve(hostPath) && !writableMounts.includes(mp)) {
        writableMounts.push(mp);
      }
    }
  }

  return {
    workspaceId,
    hostPath,
    readOnlyMounts: [
      path.join(SERO_AGENT_DIR, 'skills'),
      path.join(SERO_AGENT_DIR, 'prompts'),
    ],
    writableMounts,
  };
}
