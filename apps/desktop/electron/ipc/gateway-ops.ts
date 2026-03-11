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

import { appendFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import { workspaceManager } from '../workspace';
import {
  containerManager,
  artifactRegistry,
  SERO_SESSION_DIR,
} from './shared-infra';
import { listContainerFiles, readContainerFile } from '../container/files';
import { convertSessionMessages } from './agent-helpers';
import { convertToGatewayHistory } from './gateway-history';
import type { GatewayAgentOps } from '../gateway/types';

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
      if (pool.has(sessionId)) return;
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      appendFileSync(sessionPath, JSON.stringify(sm.getHeader()) + '\n');
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
      appendFileSync(sessionPath, JSON.stringify(sm.getHeader()) + '\n');
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
    getSessionHistory: async (workspaceId, sessionId) => {
      // If session is already open in the pool, read from live state
      const existing = pool.get(sessionId);
      if (existing) {
        const chatMsgs = convertSessionMessages(existing.session.messages);
        return convertToGatewayHistory(chatMsgs);
      }
      // Otherwise, find and read the session file directly
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const allSessions = await SessionManager.list(os.homedir(), SERO_SESSION_DIR);
      const sessionInfo = allSessions.find((s) => s.id === sessionId && s.cwd === wsPath);
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
