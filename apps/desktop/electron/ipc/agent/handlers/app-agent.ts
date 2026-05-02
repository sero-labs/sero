/**
 * App Agent IPC handlers — per-app dedicated agent sessions.
 *
 * Each Sero app gets its own lightweight AgentSession that runs
 * independently of the user's chat sessions. This allows apps to
 * make LLM calls without requiring the user to have an active chat.
 *
 * App sessions are:
 *   - Created lazily on first use (keyed by appId + workspaceId)
 *   - In-memory only (no session persistence — apps store state in their own files)
 *   - Have a Read tool so skills can be loaded on-demand (Pi's progressive disclosure)
 *   - Share the same auth, model, and settings as chat sessions
 *   - Load the app package's own extensions + skills via a dedicated ResourceLoader
 *
 * The renderer calls `window.sero.appAgent.prompt(appId, workspaceId, text)`
 * and receives a plain string response (the LLM's text output).
 */

import { app, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import {
  createAgentSession,
  createReadTool,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import os from 'os';
import path from 'path';

import { IpcChannels } from '@/types/ipc-channels';
import { discoverApps } from '@electron/features/apps/discovery';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { workspaceManager } from '@electron/features/workspace/manager';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import { syncAppSessionModel } from '@electron/ipc/agent/core/app-agent-session-model-sync';
import { invokeAppSessionTool } from './app-agent-tools';

// ── App Session Pool ─────────────────────────────────────────

interface AppSessionEntry {
  session: AgentSession;
}

interface AppPackageResources {
  extensionPaths: string[];
  skillPaths: string[];
}

/**
 * Map<`${appId}:${workspaceId}`, AppSessionEntry>
 *
 * Each app × workspace pair gets one session. Sessions are created
 * lazily and reused for subsequent calls.
 */
const appPool = new Map<string, AppSessionEntry>();

function poolKey(appId: string, workspaceId: string): string {
  return `${appId}:${workspaceId}`;
}


// ── App package resource resolution ─────────────────────────

async function resolveAppPackageResources(packagePath: string): Promise<AppPackageResources> {
  try {
    const raw = await fs.readFile(path.join(packagePath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      pi?: {
        extensions?: string[];
        skills?: string[];
      };
    };

    const extensionEntries = pkg.pi?.extensions ?? [];
    const skillEntries = pkg.pi?.skills ?? [];

    return {
      extensionPaths: extensionEntries.map((entry) => path.resolve(packagePath, entry)),
      skillPaths: skillEntries.map((entry) => path.resolve(packagePath, entry)),
    };
  } catch {
    return { extensionPaths: [], skillPaths: [] };
  }
}

/**
 * Find an app's package path by its id using app discovery.
 * Result is cached after first call.
 *
 * The plugin manager calls clearAppManifestCache() after plugin install /
 * uninstall so hot-loaded plugins are picked up without an Electron restart.
 */
let appManifestCache: Map<string, string> | null = null;

async function getAppPackagePath(appId: string): Promise<string | null> {
  if (!appManifestCache) {
    try {
      const apps = await discoverApps();
      appManifestCache = new Map(apps.map((entry) => [entry.id, entry.packagePath]));
    } catch (err) {
      console.error('[app-agent] Failed to discover apps for resource resolution:', err);
      return null;
    }
  }
  return appManifestCache.get(appId) ?? null;
}

/** Invalidate the manifest cache (e.g. when new apps are installed). */
export function clearAppManifestCache(): void {
  appManifestCache = null;
}

// ── Session creation ─────────────────────────────────────────

/** Get or create a lightweight session for an app. */
async function getOrCreateAppSession(
  appId: string,
  workspaceId: string,
): Promise<AgentSession> {
  const key = poolKey(appId, workspaceId);
  const infra = await ensureInfra();
  const existing = appPool.get(key);
  if (existing) {
    await syncAppSessionModel(existing.session, infra.model);
    return existing.session;
  }

  const wsPath = workspaceManager.getPath(workspaceId)
    ?? path.join(os.homedir(), '.sero-ui');

  const packagePath = await getAppPackagePath(appId);
  const resources = packagePath
    ? await resolveAppPackageResources(packagePath)
    : { extensionPaths: [], skillPaths: [] };

  // Scoped to this app's own extensions + skills only.
  // Global extensions stay disabled so app sessions remain isolated.
  const loader = new DefaultResourceLoader({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    additionalExtensionPaths: resources.extensionPaths,
    additionalSkillPaths: resources.skillPaths,
  });
  await loader.reload();

  const readTool = createReadTool(wsPath);

  const { session } = await createAgentSession({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    model: infra.model ?? undefined,
    thinkingLevel: 'high',
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    tools: [readTool],
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(wsPath),
    settingsManager: infra.settingsManager,
  });

  session.extensionRunner?.setUIContext(createSeroUIContext());

  appPool.set(key, { session });
  return session;
}

export function getAppAgentSessions(): AgentSession[] {
  return [...appPool.values()].map((entry) => entry.session);
}

/** Dispose all in-memory app sessions for a specific app id. */
export function disposeAppSessionsForApp(appId: string): void {
  for (const [key, entry] of [...appPool.entries()]) {
    if (!key.startsWith(`${appId}:`)) continue;
    entry.session.dispose();
    appPool.delete(key);
  }
}

/** Close all app sessions (app shutdown). */
function disposeAllAppSessions(): void {
  for (const [, entry] of appPool) {
    entry.session.dispose();
  }
  appPool.clear();
}

// ── Registration ─────────────────────────────────────────────

export function registerAppAgentHandlers(): void {
  /**
   * sero:app-agent:prompt
   *
   * Send a prompt to an app's dedicated session and collect the full
   * text response. Returns a string — the LLM's reply.
   *
   * This is a simple request/response pattern (not streaming).
   * The session accumulates context across calls within the same
   * app × workspace, so the LLM can reference earlier interactions.
   */
  ipcMain.handle(
    IpcChannels.appAgent.prompt,
    async (
      _event,
      appId: string,
      workspaceId: string,
      text: string,
    ): Promise<string> => {
      const session = await getOrCreateAppSession(appId, workspaceId);

      let responseText = '';
      const unsubscribe = session.subscribe((event) => {
        if (event.type === 'message_update') {
          const assistantEvent = event.assistantMessageEvent;
          if (assistantEvent.type === 'text_delta') {
            responseText += assistantEvent.delta;
          }
        }
      });

      try {
        await session.prompt(text);
      } finally {
        unsubscribe();
      }

      return responseText;
    },
  );

  /**
   * sero:app-agent:prompt-stream
   *
   * Like prompt, but pushes text_delta events to the renderer as they
   * arrive via `webContents.send()`. The renderer subscribes to
   * `sero:app-agent:stream-event` before invoking this. Returns the
   * final accumulated text.
   */
  ipcMain.handle(
    IpcChannels.appAgent.promptStream,
    async (
      event,
      appId: string,
      workspaceId: string,
      text: string,
    ): Promise<string> => {
      const session = await getOrCreateAppSession(appId, workspaceId);
      const sender = event.sender;

      let responseText = '';
      const unsubscribe = session.subscribe((sessionEvent) => {
        if (sessionEvent.type === 'message_update') {
          const assistantEvent = sessionEvent.assistantMessageEvent;
          if (assistantEvent.type === 'text_delta') {
            responseText += assistantEvent.delta;
            if (!sender.isDestroyed()) {
              sender.send(IpcChannels.appAgent.streamEvent, {
                appId,
                workspaceId,
                delta: assistantEvent.delta,
              });
            }
          }
        }
      });

      try {
        await session.prompt(text);
      } finally {
        unsubscribe();
      }

      return responseText;
    },
  );

  ipcMain.handle(
    IpcChannels.appAgent.invokeTool,
    async (
      _event,
      appId: string,
      workspaceId: string,
      toolName: string,
      params: Record<string, unknown> = {},
    ) => {
      const session = await getOrCreateAppSession(appId, workspaceId);
      return invokeAppSessionTool(session, toolName, params);
    },
  );

  app.on('before-quit', () => {
    disposeAllAppSessions();
  });
}
