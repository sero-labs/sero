import { readdir, stat } from 'fs/promises';
import path from 'path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

export interface SessionMetadata {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}

interface SessionHeader {
  id: string;
  cwd: string;
  timestamp: string;
}

interface SessionEntry {
  type: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

async function sessionFileNames(sessionDir: string): Promise<string[]> {
  const entries = await readdir(sessionDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name);
}

async function readSessionMetadata(sessionDir: string, fileName: string): Promise<SessionMetadata | null> {
  const filePath = path.join(sessionDir, fileName);
  const manager = SessionManager.open(filePath, sessionDir);
  const header = manager.getHeader() as SessionHeader | undefined;
  if (!header) return null;

  const branch = manager.getBranch() as SessionEntry[];
  const messages = branch.filter((entry) => entry.type === 'message' && entry.message);
  const firstUserMessage = messages.find((entry) => entry.message?.role === 'user');
  const fileStat = await stat(filePath);

  return {
    path: filePath,
    id: header.id,
    cwd: header.cwd,
    name: manager.getSessionName(),
    created: new Date(header.timestamp),
    modified: fileStat.mtime,
    messageCount: messages.length,
    firstMessage: textFromContent(firstUserMessage?.message?.content),
  };
}

export async function listSessionMetadata(sessionDir: string): Promise<SessionMetadata[]> {
  const files = await sessionFileNames(sessionDir);
  const metadata = await Promise.allSettled(files.map((file) => readSessionMetadata(sessionDir, file)));
  return metadata
    .filter((result): result is PromiseFulfilledResult<SessionMetadata | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((session): session is SessionMetadata => session !== null);
}

export async function findSessionMetadata(
  sessionDir: string,
  sessionId: string,
  cwd?: string,
): Promise<SessionMetadata | null> {
  const sessions = await listSessionMetadata(sessionDir);
  return sessions.find((session) => session.id === sessionId && (!cwd || session.cwd === cwd)) ?? null;
}
