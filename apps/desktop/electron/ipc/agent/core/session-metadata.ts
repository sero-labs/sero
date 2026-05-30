import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline';

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

interface CachedSessionMetadata {
  mtimeMs: number;
  size: number;
  metadata: SessionMetadata | null;
}

const metadataCache = new Map<string, CachedSessionMetadata>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
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

function sessionHeaderFromEntry(entry: Record<string, unknown>): SessionHeader | null {
  if (entry.type !== 'session') return null;
  const { id, cwd, timestamp } = entry;
  if (typeof id !== 'string' || typeof cwd !== 'string' || typeof timestamp !== 'string') return null;
  return { id, cwd, timestamp };
}

async function scanSessionFile(filePath: string, modified: Date): Promise<SessionMetadata | null> {
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let header: SessionHeader | null = null;
  let name: string | undefined;
  let messageCount = 0;
  let firstMessage = '';

  for await (const line of lines) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as unknown;
    if (!isRecord(entry)) continue;

    header ??= sessionHeaderFromEntry(entry);
    if (entry.type === 'session_info' && typeof entry.name === 'string') name = entry.name;
    if (entry.type !== 'message' || !isRecord(entry.message)) continue;

    messageCount += 1;
    if (!firstMessage && entry.message.role === 'user') {
      firstMessage = textFromContent(entry.message.content);
    }
  }

  if (!header) return null;
  return {
    path: filePath,
    id: header.id,
    cwd: header.cwd,
    name,
    created: new Date(header.timestamp),
    modified,
    messageCount,
    firstMessage,
  };
}

async function readSessionMetadata(sessionDir: string, fileName: string): Promise<SessionMetadata | null> {
  const filePath = path.join(sessionDir, fileName);
  const fileStat = await stat(filePath);
  const cached = metadataCache.get(filePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) return cached.metadata;

  const metadata = await scanSessionFile(filePath, fileStat.mtime);
  metadataCache.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, metadata });
  return metadata;
}

export async function listSessionMetadata(sessionDir: string): Promise<SessionMetadata[]> {
  const files = await sessionFileNames(sessionDir);
  const metadata = await Promise.allSettled(files.map((file) => readSessionMetadata(sessionDir, file)));
  for (const result of metadata) {
    if (result.status === 'rejected') console.warn('[sessions] Failed to read session metadata:', result.reason);
  }
  return metadata
    .filter((result): result is PromiseFulfilledResult<SessionMetadata | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((session): session is SessionMetadata => session !== null)
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

export async function findSessionMetadata(
  sessionDir: string,
  sessionId: string,
  cwd?: string,
): Promise<SessionMetadata | null> {
  const sessions = await listSessionMetadata(sessionDir);
  return sessions.find((session) => session.id === sessionId && (!cwd || session.cwd === cwd)) ?? null;
}
