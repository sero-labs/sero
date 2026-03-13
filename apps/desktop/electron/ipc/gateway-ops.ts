/**
 * Gateway agent operations — implementation of GatewayAgentOps methods
 * for file browsing, session management, and history.
 *
 * Extracted from agent.ts to keep file sizes under 500 LOC.
 */

import { appendFileSync } from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { ChatMessage } from '../../src/types/ipc';
import type { GatewayAgentOps } from '../gateway/types';
import { convertSessionMessages } from './agent-helpers';
import { convertToGatewayHistory } from './gateway-history';
import { workspaceManager } from '../workspace';
import { SERO_SESSION_DIR } from './shared-infra';

interface PoolEntry {
  session: AgentSession;
  workspaceId: string;
}

/**
 * Build the gateway agent ops object that bridges gateway requests
 * to the agent session pool and file system.
 */
export function buildGatewayFileOps(
  pool: Map<string, PoolEntry>,
  openSessionFn: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<ChatMessage[]>,
): Pick<
  GatewayAgentOps,
  'createSession' | 'listFiles' | 'readFile' | 'listArtifacts' | 'getArtifact' | 'getSessionHistory'
> {
  return {
    createSession: async (workspaceId, name) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      appendFileSync(sessionPath, JSON.stringify(sm.getHeader()) + '\n');
      // Note: session name is set later when the agent session is opened
      return { id: sm.getSessionId(), name: name ?? '' };
    },

    listFiles: async (workspaceId, dirPath) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const resolvedDir = path.resolve(wsPath, dirPath === '/' ? '.' : dirPath);
      const entries = await fsPromises.readdir(resolvedDir, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
          path: path.join(dirPath === '/' ? '/' : dirPath, e.name),
          size: 0,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    },

    readFile: async (workspaceId, filePath) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const resolvedPath = path.resolve(wsPath, filePath.startsWith('/') ? filePath.slice(1) : filePath);
      const stat = await fsPromises.stat(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();
      const textExts = new Set([
        '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.html',
        '.css', '.scss', '.yaml', '.yml', '.toml', '.sh', '.py', '.rs',
        '.go', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
        '.rb', '.lua', '.sql', '.xml', '.ini', '.cfg', '.env',
      ]);
      const isText = textExts.has(ext);
      if (isText) {
        const content = await fsPromises.readFile(resolvedPath, 'utf8');
        return { content, encoding: 'utf8' as const, mimeType: 'text/plain', size: stat.size };
      }
      const content = (await fsPromises.readFile(resolvedPath)).toString('base64');
      return { content, encoding: 'base64' as const, mimeType: 'application/octet-stream', size: stat.size };
    },

    listArtifacts: async () => {
      return [];
    },

    getArtifact: async () => {
      return null;
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
