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
 *   - Load skills from the app's package via a dedicated ResourceLoader
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

import { IpcChannels } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';
import { SERO_AGENT_DIR } from '../env';
import { discoverApps } from '../app-discovery';
import { ensureInfra } from './shared-infra';

// ── App Session Pool ─────────────────────────────────────────

interface AppSessionEntry {
  session: AgentSession;
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

// ── Skill path resolution ────────────────────────────────────

/**
 * Read the `pi.skills` array from a package's package.json and
 * resolve each entry to an absolute path.
 */
async function resolveAppSkillPaths(packagePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(packagePath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const skillEntries: string[] = pkg.pi?.skills ?? [];
    return skillEntries.map((s) => path.resolve(packagePath, s));
  } catch {
    return [];
  }
}

/**
 * Find an app's package path by its id using app discovery.
 * Result is cached after first call.
 *
 * TODO: Wire up clearAppManifestCache() to hot-install events so
 * newly added apps are picked up without an Electron restart.
 */
let appManifestCache: Map<string, string> | null = null;

async function getAppPackagePath(appId: string): Promise<string | null> {
  if (!appManifestCache) {
    try {
      const apps = await discoverApps();
      appManifestCache = new Map(apps.map((a) => [a.id, a.packagePath]));
    } catch (err) {
      console.error('[app-agent] Failed to discover apps for skill resolution:', err);
      // Return null so the session still starts (just without skills)
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
  const existing = appPool.get(key);
  if (existing) return existing.session;

  const infra = await ensureInfra();

  // Resolve workspace path (fall back to home dir)
  const wsPath = workspaceManager.getPath(workspaceId)
    ?? path.join(os.homedir(), '.sero-ui');

  // Resolve skill paths from the app's package
  const packagePath = await getAppPackagePath(appId);
  const skillPaths = packagePath ? await resolveAppSkillPaths(packagePath) : [];

  // Create a resource loader scoped to this app's skills only.
  // No extensions, prompt templates, or themes — just skills.
  const loader = new DefaultResourceLoader({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    additionalSkillPaths: skillPaths,
  });
  await loader.reload();

  // Read tool is required so the agent can load skill files on-demand
  // (Pi skills use progressive disclosure — only name/description are
  // in the system prompt, the agent reads the full SKILL.md when needed).
  const readTool = createReadTool(wsPath);

  const { session } = await createAgentSession({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    model: infra.model,
    thinkingLevel: 'high',
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    tools: [readTool],
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(wsPath),
    settingsManager: infra.settingsManager,
  });

  appPool.set(key, { session });
  return session;
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

      // Collect the full response text
      let responseText = '';
      const unsubscribe = session.subscribe((event) => {
        if (event.type === 'message_update') {
          const ame = event.assistantMessageEvent;
          if (ame.type === 'text_delta') {
            responseText += ame.delta;
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
          const ame = sessionEvent.assistantMessageEvent;
          if (ame.type === 'text_delta') {
            responseText += ame.delta;
            // Push each delta to the renderer immediately
            if (!sender.isDestroyed()) {
              sender.send(IpcChannels.appAgent.streamEvent, {
                appId,
                workspaceId,
                delta: ame.delta,
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

  // ── Cleanup on app quit ────────────────────────────────────
  app.on('before-quit', () => {
    disposeAllAppSessions();
  });
}
