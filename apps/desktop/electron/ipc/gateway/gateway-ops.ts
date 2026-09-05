/**
 * Gateway agent operations — implements GatewayAgentOps for the agent bridge.
 *
 * Extracted from agent.ts to keep file sizes under 500 LOC.
 * Provides file listing, file reading, session creation, artifact
 * operations, and session history for the web-remote gateway.
 *
 * File operations route through the selected workspace runtime.
 */

import fs from 'fs/promises';
import path from 'path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { workspaceManager } from '@electron/features/workspace/manager';
import {
  artifactRegistry,
  runtimeManager,
  SERO_SESSION_DIR,
} from '@electron/shared/infra/shared-infra';
import { buildModelState, convertSessionMessages } from '../agent/core/agent-helpers';
import { isPathInsideDirectory } from '../agent/handlers/sessions';
import { listSessionMetadata } from '../agent/core/session-metadata';
import { convertToGatewayHistory } from './gateway-history';
import { applySessionModel, applySessionThinkingLevel, toGatewayModelState } from './model-ops';
import { searchSessions, MAX_RESULTS } from './session-search';
import { commitChanges, readGitDiff, readGitStatus } from './git-ops';
import { uploadFile } from './upload-file';
import type {
  GatewayAgentOps,
  GatewayDevServerInfo,
  GatewayDevServerTarget,
  GatewayDevServerChange,
} from '@electron/features/gateway/server/types';
import type { RuntimeDevServer } from '@electron/features/workspace/runtime/types';
import type { AgentStreamEvent } from '@/types/ipc';

/** MIME type map for common source file extensions. */
const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.js': 'application/javascript', '.jsx': 'application/javascript',
  '.json': 'application/json', '.html': 'text/html',
  '.css': 'text/css', '.md': 'text/markdown',
  '.py': 'text/x-python', '.rs': 'text/x-rust',
  '.go': 'text/x-go', '.yaml': 'text/yaml', '.yml': 'text/yaml',
  '.toml': 'text/x-toml', '.sh': 'text/x-sh',
};

/**
 * A path from the remote, in the shape the runtime wants.
 *
 * The remote asks for the workspace root as `/`, which is not a runtime
 * path. Every other path it sends came back from an earlier listing, so
 * it is already runtime-shaped and passes through unchanged.
 */
function toRuntimeDirPath(runtimeWorkspacePath: string, dirPath: string): string {
  const trimmed = dirPath.trim();
  return trimmed === '' || trimmed === '/' || trimmed === '.'
    ? runtimeWorkspacePath
    : trimmed;
}

interface SessionPool {
  has(id: string): boolean;
  get(id: string): {
    session: AgentSession;
    workspaceId: string;
  } | undefined;
}

function toGatewayDevServerInfo(workspaceId: string, server: RuntimeDevServer): GatewayDevServerInfo {
  return {
    id: server.id,
    workspaceId,
    name: server.id,
    port: server.port,
    status: 'running',
    registeredAt: new Date(0).toISOString(),
  };
}

async function findSessionInfo(workspaceId: string, sessionId: string): Promise<{
  id: string;
  cwd: string;
  path: string;
} | null> {
  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);

  const workspaceSessions = await SessionManager.list(wsPath, SERO_SESSION_DIR);
  return workspaceSessions.find((session) => session.id === sessionId) ?? null;
}

/**
 * Build the full GatewayAgentOps implementation.
 *
 * @param pool - The active session pool from agent.ts
 * @param openSessionInternal - Callback to open a session in the pool
 * @param sendEvent - The pool's event sender, for model_change
 */
export function buildGatewayOps(
  pool: SessionPool,
  openSessionInternal: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<unknown>,
  /**
   * The pool's event sender. A model change made from the phone is sent
   * on as `model_change`, so a desktop window showing the same session
   * updates instead of holding a stale model.
   */
  sendEvent: (event: AgentStreamEvent) => void,
): GatewayAgentOps {
  /**
   * Tell the desktop the model changed, then answer the phone with the
   * new state. Both surfaces read the same session, so a change on one
   * must reach the other.
   */
  function announce(sessionId: string, session: AgentSession) {
    const state = buildModelState({ session });
    sendEvent({ type: 'model_change', sessionId, state });
    return toGatewayModelState(session);
  }

  const opsRef: GatewayAgentOps = {
    getSessionWorkspaceId: (sessionId) => pool.get(sessionId)?.workspaceId ?? null,

    openSession: async (sessionId, workspaceId) => {
      const existing = pool.get(sessionId);
      if (existing) {
        if (existing.workspaceId !== workspaceId) {
          throw new Error(`Session ${sessionId} is bound to workspace ${existing.workspaceId}, not ${workspaceId}`);
        }
        return;
      }

      const existingSession = await findSessionInfo(workspaceId, sessionId);
      if (existingSession) {
        await openSessionInternal(sessionId, existingSession.path, workspaceId);
        return;
      }

      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      await fs.appendFile(sessionPath, JSON.stringify(sm.getHeader()) + '\n', 'utf8');
      await openSessionInternal(sessionId, sessionPath, workspaceId);
    },
    prompt: async (sessionId, text, images) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      if (images && images.length > 0) {
        const imageContents = images.map((img) => ({
          type: 'image' as const, data: img.data, mimeType: img.mimeType,
        }));
        await entry.session.prompt(text, { images: imageContents });
      } else {
        await entry.session.prompt(text);
      }
    },
    steer: async (sessionId, text) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await entry.session.steer(text);
    },
    abort: async (sessionId) => {
      const entry = pool.get(sessionId);
      if (entry) await entry.session.abort();
    },
    listWorkspaces: async () => {
      const ws = await workspaceManager.list();
      return ws.map((w) => ({ id: w.id, name: w.name, path: w.path || '' }));
    },
    listSessions: async (workspaceId) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) return [];
      // listSessionMetadata reads the JSONL headers, which is where the
      // modified time and message count live. SessionManager.list has
      // neither, and the session row needs both.
      const all = await listSessionMetadata(SERO_SESSION_DIR);
      return all
        .filter((session) => session.cwd === wsPath)
        .map((session) => ({
          id: session.id,
          name: session.name || '',
          firstMessage: session.firstMessage || '',
          workspaceId,
          updatedAt: session.modified.toISOString(),
          messageCount: session.messageCount,
        }));
    },
    searchSessions: async (workspaceIds, query, limit) => {
      // One directory scan serves every workspace. Map each session
      // back to its workspace by path, and drop the rest.
      const workspaceByPath = new Map<string, string>();
      for (const workspaceId of workspaceIds) {
        const wsPath = workspaceManager.getPath(workspaceId);
        if (wsPath) workspaceByPath.set(wsPath, workspaceId);
      }
      if (workspaceByPath.size === 0) return [];

      const all = await listSessionMetadata(SERO_SESSION_DIR);
      const searchable = all.flatMap((session) => {
        const workspaceId = workspaceByPath.get(session.cwd);
        if (!workspaceId) return [];
        return [{
          id: session.id,
          workspaceId,
          name: session.name || '',
          firstMessage: session.firstMessage || '',
          updatedAt: session.modified.toISOString(),
          messageCount: session.messageCount,
          path: session.path,
        }];
      });

      return searchSessions(searchable, query, limit || MAX_RESULTS);
    },
    deleteSession: async (workspaceId, sessionId) => {
      // findSessionInfo lists only this workspace's sessions, so an id
      // from another workspace finds nothing and deletes nothing.
      const info = await findSessionInfo(workspaceId, sessionId);
      if (!info) throw new Error(`Session not found in workspace: ${sessionId}`);

      // Same guard the desktop handler uses: never unlink outside the
      // session directory, whatever the listing returned.
      const resolved = path.resolve(info.path);
      if (!isPathInsideDirectory(resolved, SERO_SESSION_DIR)) {
        throw new Error('Refusing to delete file outside session directory');
      }

      try {
        await fs.unlink(resolved);
      } catch (err) {
        // Already gone is the outcome the caller wanted.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },

    createSession: async (workspaceId, name) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      await fs.appendFile(sessionPath, JSON.stringify(sm.getHeader()) + '\n', 'utf8');
      return {
        id: sm.getSessionId(),
        name: name || '',
        firstMessage: '',
        workspaceId,
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      };
    },
    getSessionModel: async (sessionId, workspaceId) => {
      // The phone reads the model before its first prompt, so open the
      // session here the same way a prompt does.
      await opsRef.openSession(sessionId, workspaceId);
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      return toGatewayModelState(entry.session);
    },

    setSessionModel: async (sessionId, provider, modelId) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await applySessionModel(entry.session, provider, modelId);
      return announce(sessionId, entry.session);
    },

    setSessionThinkingLevel: async (sessionId, level) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      applySessionThinkingLevel(entry.session, level);
      return announce(sessionId, entry.session);
    },

    gitStatus: async (workspaceId) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return readGitStatus(wsPath);
    },
    gitDiff: async (workspaceId, filePath, staged) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return readGitDiff(wsPath, filePath, staged);
    },
    gitCommit: async (workspaceId, message, paths) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return commitChanges(wsPath, message, paths);
    },
    listFiles: async (workspaceId, dirPath) => {
      const runtime = await runtimeManager.getRuntime(workspaceId);
      const entries = await runtime.listFiles({
        path: toRuntimeDirPath(runtime.runtimeWorkspacePath, dirPath),
      });
      return entries.filter((entry) => !entry.name.startsWith('.'));
    },
    readFile: async (workspaceId, filePath) => {
      const runtime = await runtimeManager.getRuntime(workspaceId);
      const { content } = await runtime.readFile({ path: filePath });
      const ext = path.extname(filePath).toLowerCase();
      return {
        content,
        encoding: 'utf8' as const,
        mimeType: MIME_MAP[ext] ?? 'text/plain',
        size: Buffer.byteLength(content, 'utf8'),
      };
    },
    uploadFile: async (workspaceId, filePath, contentBase64) => {
      const runtime = await runtimeManager.getRuntime(workspaceId);
      return uploadFile(runtime, filePath, contentBase64);
    },
    listArtifacts: async (sessionId) => {
      return artifactRegistry.list(sessionId).map((a) => ({
        id: a.id, type: a.type, title: a.title,
        timestamp: a.timestamp, mimeType: a.mimeType,
      }));
    },
    getArtifact: async (artifactId) => {
      const a = artifactRegistry.get(artifactId);
      if (!a) return null;
      return { base64: a.base64 ?? '', mimeType: a.mimeType, title: a.title };
    },
    listDevServers: async (workspaceId): Promise<GatewayDevServerInfo[]> => {
      if (!workspaceId) return [];
      const runtime = await runtimeManager.getRuntime(workspaceId);
      const status = await runtime.getDevServerStatus({});
      return status.servers.map((server) => toGatewayDevServerInfo(workspaceId, server));
    },

    resolveDevServerTarget: async (
      workspaceId,
      port,
    ): Promise<GatewayDevServerTarget | null> => {
      const runtime = await runtimeManager.getRuntime(workspaceId);
      const matching = (await runtime.getDevServerStatus({})).servers.find((server) => server.port === port);
      if (!matching) return null;

      const upstreamUrl = new URL(matching.url);
      const upstreamPort = Number.parseInt(upstreamUrl.port, 10) || port;
      return {
        workspaceId,
        port,
        host: upstreamUrl.hostname || '127.0.0.1',
        upstreamPort,
      };
    },

    onDevServerChange: (cb: (change: GatewayDevServerChange) => void) => {
      return runtimeManager.onDevServerChange((event) => {
        if (event.type === 'registered' && event.server) {
          const workspaceId = event.server.workspaceId;
          void runtimeManager.getRuntime(workspaceId)
            .then((runtime) => runtime.getDevServerStatus({}))
            .then((status) => {
              const server = status.servers.find((candidate) => candidate.id === event.serverId);
              if (server) cb({ type: 'registered', workspaceId, server: toGatewayDevServerInfo(workspaceId, server) });
            })
            .catch((err) => console.warn('[gateway] Failed to resolve registered dev server:', err));
          return;
        }
        const workspaceId = event.serverId?.split(':')[0] ?? '';
        if (event.type === 'unregistered' && event.serverId) {
          cb({ type: 'unregistered', serverId: event.serverId, workspaceId });
        } else if (event.type === 'status_changed' && event.serverId && event.status) {
          cb({ type: 'status_changed', serverId: event.serverId, workspaceId, status: event.status });
        }
      });
    },

    getSessionHistory: async (workspaceId, sessionId) => {
      // If session is already open in the pool, read from live state.
      // Still enforce the workspace/session binding so a scoped token cannot
      // claim a foreign session ID under an authorized workspace.
      const existing = pool.get(sessionId);
      if (existing) {
        if (existing.workspaceId !== workspaceId) {
          throw new Error(`Session ${sessionId} is bound to workspace ${existing.workspaceId}, not ${workspaceId}`);
        }
        const chatMsgs = convertSessionMessages(existing.session.messages);
        return convertToGatewayHistory(chatMsgs);
      }
      // Otherwise, find and read the session file directly
      const sessionInfo = await findSessionInfo(workspaceId, sessionId);
      if (!sessionInfo) throw new Error(`Session not found: ${sessionId}`);
      const sm = SessionManager.open(sessionInfo.path, SERO_SESSION_DIR);
      const branch = sm.getBranch();
      const messages = branch
        .filter((e): e is typeof e & { type: 'message' } => e.type === 'message')
        .map((e) => e.message);
      const chatMsgs = convertSessionMessages(messages);
      return convertToGatewayHistory(chatMsgs);
    },
  };

  return opsRef;
}
