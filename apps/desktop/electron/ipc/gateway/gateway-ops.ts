/**
 * Gateway agent operations — implements GatewayAgentOps for the agent bridge.
 *
 * Extracted from agent.ts to keep file sizes under 500 LOC.
 * Provides file listing, file reading, session creation, artifact
 * operations, and session history for the web-remote gateway.
 *
 * File operations handle both container and host-only workspaces:
 * - Container workspaces use listContainerFiles/readContainerFile
 * - Host-only workspaces read directly from the filesystem
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import { workspaceManager } from '@electron/features/workspace/manager';
import {
  containerManager,
  artifactRegistry,
  SERO_SESSION_DIR,
} from '@electron/shared/infra/shared-infra';
import { listContainerFiles, readContainerFile } from '@electron/features/container/filesystem/files';
import { convertSessionMessages } from '../agent/core/agent-helpers';
import { convertToGatewayHistory } from './gateway-history';
import type {
  GatewayAgentOps,
  GatewayDevServerInfo,
  GatewayDevServerTarget,
  GatewayDevServerChange,
} from '@electron/features/gateway/server/types';
import type { DevServer } from '@/types/ipc';

/**
 * Validate that a resolved path stays within the workspace root.
 * Prevents path traversal attacks (e.g. "../../etc/passwd").
 */
function assertPathWithinWorkspace(wsPath: string, requestedPath: string): string {
  const resolved = path.resolve(wsPath, requestedPath.replace(/^\/+/, ''));
  const normalizedWs = path.resolve(wsPath);
  if (!resolved.startsWith(normalizedWs + path.sep) && resolved !== normalizedWs) {
    throw new Error(`Path traversal denied: ${requestedPath}`);
  }
  return resolved;
}

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

interface SessionPool {
  has(id: string): boolean;
  get(id: string): {
    session: AgentSession;
    workspaceId: string;
  } | undefined;
}

function toGatewayDevServerInfo(server: DevServer): GatewayDevServerInfo {
  return {
    id: server.id,
    workspaceId: server.workspaceId,
    name: server.name,
    port: server.port,
    framework: server.framework,
    status: server.status,
    registeredAt: server.registeredAt,
  };
}

async function findSessionInfo(workspaceId: string, sessionId: string): Promise<{
  id: string;
  cwd: string;
  path: string;
} | null> {
  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);

  const allSessions = await SessionManager.list(os.homedir(), SERO_SESSION_DIR);
  return allSessions.find((session) => session.id === sessionId && session.cwd === wsPath) ?? null;
}

/**
 * Build the full GatewayAgentOps implementation.
 *
 * @param pool - The active session pool from agent.ts
 * @param openSessionInternal - Callback to open a session in the pool
 */
export function buildGatewayOps(
  pool: SessionPool,
  openSessionInternal: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<unknown>,
): GatewayAgentOps {
  return {
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
      const all = await SessionManager.list(os.homedir(), SERO_SESSION_DIR);
      return all.filter((s) => s.cwd === wsPath).map((s) => ({
        id: s.id, name: s.name || '', firstMessage: s.firstMessage || '',
      }));
    },
    createSession: async (workspaceId, name) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      await fs.appendFile(sessionPath, JSON.stringify(sm.getHeader()) + '\n', 'utf8');
      return { id: sm.getSessionId(), name: name || '' };
    },
    listFiles: async (workspaceId, dirPath) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
      if (containerEnabled) {
        const entries = await listContainerFiles(
          workspaceId, dirPath,
          (wId, cmd) => containerManager.exec(wId, cmd),
        );
        return entries.map((e) => ({ ...e, path: `${dirPath}/${e.name}` }));
      }
      // Host-only: read from workspace filesystem directly
      const fullPath = assertPathWithinWorkspace(wsPath, dirPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
          path: `${dirPath === '/' ? '' : dirPath}/${e.name}`,
          size: 0,
        }));
    },
    readFile: async (workspaceId, filePath) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
      let content: string;
      if (containerEnabled) {
        content = await readContainerFile(
          workspaceId, filePath,
          (wId, cmd) => containerManager.exec(wId, cmd),
        );
      } else {
        const fullPath = assertPathWithinWorkspace(wsPath, filePath);
        content = await fs.readFile(fullPath, 'utf8');
      }
      const ext = path.extname(filePath).toLowerCase();
      return {
        content,
        encoding: 'utf8' as const,
        mimeType: MIME_MAP[ext] ?? 'text/plain',
        size: Buffer.byteLength(content, 'utf8'),
      };
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
      return containerManager.devServers.list(workspaceId).map(toGatewayDevServerInfo);
    },

    resolveDevServerTarget: async (
      workspaceId,
      port,
    ): Promise<GatewayDevServerTarget | null> => {
      // Only registered dev servers are reachable through the proxy. This
      // prevents the proxy from being used to scan arbitrary container ports.
      const matching = containerManager.devServers
        .list(workspaceId)
        .find((s) => s.port === port);
      if (!matching) return null;

      const containerIp = containerManager.portScanner.getIp(workspaceId);
      if (!containerIp) return null;

      // The port scanner already knows whether to use a bridge port for
      // localhost-only servers — fall back to the original port if the
      // scanner hasn't seen it yet (server may be starting up).
      const detected = containerManager.portScanner
        .getPorts(workspaceId)
        .find((p) => p.port === port);
      if (!detected) return null;

      const upstreamUrl = new URL(detected.url);
      const upstreamPort = Number.parseInt(upstreamUrl.port, 10) || port;
      return {
        workspaceId,
        port,
        host: upstreamUrl.hostname || containerIp,
        upstreamPort,
      };
    },

    onDevServerChange: (cb: (change: GatewayDevServerChange) => void) => {
      return containerManager.devServers.onChange((event) => {
        if (event.type === 'registered') {
          cb({
            type: 'registered',
            workspaceId: event.server.workspaceId,
            server: toGatewayDevServerInfo(event.server),
          });
          return;
        }
        const tracked = containerManager.devServers.get(event.serverId);
        // The registry sometimes emits unregister/status events after the
        // entry has already been removed; recover the workspaceId from the
        // serverId format `${workspaceId}:${scope}:${cardId}:${port}`.
        const workspaceId = tracked?.workspaceId ?? event.serverId.split(':')[0] ?? '';
        if (event.type === 'unregistered') {
          cb({ type: 'unregistered', serverId: event.serverId, workspaceId });
        } else {
          cb({
            type: 'status_changed',
            serverId: event.serverId,
            workspaceId,
            status: event.status,
          });
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
}
