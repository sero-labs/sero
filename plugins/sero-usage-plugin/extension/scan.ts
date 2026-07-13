/**
 * Session file discovery and streaming parse.
 *
 * Read-only against the profile's sessions tree. Consumes exactly three
 * entry shapes per docs/specs/sero-usage-plugin-spec.md §2.2; everything
 * else — including malformed lines — is skipped silently.
 */

import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

export interface UsageMessage {
  provider: string;
  model: string;
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Epoch ms; 0 when missing/unparseable. */
  timestamp: number;
}

export interface ParsedSession {
  sessionId: string;
  /** Absolute .jsonl path. */
  path: string;
  cwd: string;
  name?: string;
  firstMessage?: string;
  messages: UsageMessage[];
}

const LABEL_MAX_LENGTH = 100;

/** Recursively collect .jsonl files, sorted by path for deterministic dedup. */
export async function collectSessionFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  await collectRecursively(rootDir, files);
  files.sort();
  return files;
}

async function collectRecursively(dir: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip silently
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRecursively(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join(' ');
}

function toLabel(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > LABEL_MAX_LENGTH ? `${singleLine.slice(0, LABEL_MAX_LENGTH)}…` : singleLine;
}

function parseUsageMessage(entry: Record<string, unknown>): UsageMessage | null {
  const message = entry.message;
  if (!isRecord(message) || message.role !== 'assistant') return null;
  const usage = message.usage;
  if (!isRecord(usage) || typeof message.provider !== 'string' || typeof message.model !== 'string') {
    return null;
  }

  const entryTs = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : 0;
  const timestamp =
    typeof message.timestamp === 'number' && message.timestamp > 0
      ? message.timestamp
      : Number.isFinite(entryTs) && entryTs > 0
        ? entryTs
        : 0;

  const cost = isRecord(usage.cost) && typeof usage.cost.total === 'number' ? usage.cost.total : 0;

  return {
    provider: message.provider,
    model: message.model,
    cost,
    input: typeof usage.input === 'number' ? usage.input : 0,
    output: typeof usage.output === 'number' ? usage.output : 0,
    cacheRead: typeof usage.cacheRead === 'number' ? usage.cacheRead : 0,
    cacheWrite: typeof usage.cacheWrite === 'number' ? usage.cacheWrite : 0,
    timestamp,
  };
}

/**
 * Streaming parse of one session file. Returns null for files with no
 * session header or that cannot be read. Dedup is NOT applied here —
 * it must run globally across files (spec §2.3).
 */
export async function parseSessionFile(filePath: string): Promise<ParsedSession | null> {
  let lines;
  try {
    lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  } catch {
    return null;
  }

  let sessionId = '';
  let cwd = '';
  let name: string | undefined;
  let firstMessage: string | undefined;
  const messages: UsageMessage[] = [];

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // malformed line
      }
      if (!isRecord(entry)) continue;

      if (entry.type === 'session') {
        if (!sessionId && typeof entry.id === 'string') {
          sessionId = entry.id;
          if (typeof entry.cwd === 'string') cwd = entry.cwd;
        }
        continue;
      }
      if (entry.type === 'session_info') {
        if (typeof entry.name === 'string' && entry.name.trim()) name = toLabel(entry.name);
        continue;
      }
      if (entry.type !== 'message' || !isRecord(entry.message)) continue;

      if (!firstMessage && entry.message.role === 'user') {
        const text = toLabel(textFromContent(entry.message.content));
        if (text) firstMessage = text;
      }

      const usageMessage = parseUsageMessage(entry);
      if (usageMessage) messages.push(usageMessage);
    }
  } catch {
    return null; // read error mid-stream — skip the file
  }

  if (!sessionId) return null;
  return { sessionId, path: filePath, cwd, name, firstMessage, messages };
}
