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
 *   - Tool-free by default (pure text completion — apps that need tools can register them)
 *   - Share the same auth, model, and settings as chat sessions
 *
 * The renderer calls `window.sero.appAgent.prompt(appId, workspaceId, text)`
 * and receives a plain string response (the LLM's text output).
 */

import { app, ipcMain } from 'electron';
import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import os from 'os';
import path from 'path';

import { IpcChannels } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';
import { SERO_AGENT_DIR } from '../env';
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

  const { session } = await createAgentSession({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    model: infra.model,
    thinkingLevel: 'high',
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    tools: [], // No tools — pure text completion
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

  // ── Cleanup on app quit ────────────────────────────────────
  app.on('before-quit', () => {
    disposeAllAppSessions();
  });
}
