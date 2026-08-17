/**
 * Paged history reads for a managed persistent session (architecture.md §12.2).
 *
 * History IS the Pi session file. It is never copied into product state, and
 * the turn index is derived on read, so it cannot drift from the transcript.
 *
 * Reads page from the TAIL: opening a long-running session must not load the
 * whole file, and the newest turns are what a viewer wants first.
 *
 * This works for a disposed session too — history outlives the live
 * `AgentSession`, which is what makes a retired or failed member still
 * readable.
 */

import { readFileSync } from 'fs';

import type {
  PersistentSessionHistoryEntry,
  PersistentSessionHistoryPage,
} from '@sero-ai/common';

const DEFAULT_PAGE_SIZE = 60;

interface RawEntry {
  type?: unknown;
  timestamp?: unknown;
  message?: { role?: unknown; content?: unknown } | unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Pi content is a string or a block array; only text blocks carry readable text. */
function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (isRecord(block) && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n');
}

function toRole(role: unknown): PersistentSessionHistoryEntry['role'] {
  return role === 'assistant' || role === 'system' || role === 'tool' ? role : 'user';
}

/**
 * One readable entry per session line, or null for lines that carry no text a
 * reader would want (headers, label changes, model switches).
 */
function toHistoryEntry(raw: unknown, turnIndex: number): PersistentSessionHistoryEntry | null {
  if (!isRecord(raw)) return null;
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : '';

  if (raw.type === 'compaction') {
    return {
      turnIndex,
      timestamp,
      role: 'system',
      // The UI marks this in place so shortened history above it is explained.
      text: typeof raw.summary === 'string' ? raw.summary : 'Context compacted.',
      compactionBoundary: true,
    };
  }

  if (raw.type !== 'message' || !isRecord(raw.message)) return null;
  const text = textFromContent(raw.message.content);
  if (!text) return null;

  return { turnIndex, timestamp, role: toRole(raw.message.role), text };
}

export interface ReadHistoryOptions {
  /** Opaque cursor from a previous page. Absent means "start at the tail". */
  cursor?: string;
  limit?: number;
  /** Injected in tests so this stays a pure function of file content. */
  readFile?(sessionPath: string): string;
}

/**
 * The cursor is the line index this page started at. It is opaque to callers by
 * contract, but keeping it a plain index means a page boundary cannot drift
 * when the file grows: growth only ever appends, so earlier indices are stable.
 */
function parseCursor(cursor: string | undefined, lineCount: number): number {
  if (!cursor) return lineCount;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= lineCount ? parsed : lineCount;
}

export function readSessionHistoryPage(
  sessionPath: string,
  options: ReadHistoryOptions = {},
): PersistentSessionHistoryPage {
  const read = options.readFile ?? ((target: string) => readFileSync(target, 'utf8'));
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;

  const lines = read(sessionPath).split('\n').filter((line) => line.trim().length > 0);
  const end = parseCursor(options.cursor, lines.length);
  const start = Math.max(0, end - limit);

  const entries: PersistentSessionHistoryEntry[] = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    // A malformed line is skipped rather than failing the page — one bad write
    // must not make an entire session unreadable.
    const parsed = parseLine(line);
    if (parsed === null) continue;
    const entry = toHistoryEntry(parsed, index);
    if (entry) entries.push(entry);
  }

  return { entries, olderCursor: start > 0 ? String(start) : null };
}

function parseLine(line: string): RawEntry | null {
  try {
    return JSON.parse(line) as RawEntry;
  } catch {
    return null;
  }
}

/**
 * Turn boundaries, compaction points and message counts for the whole session,
 * so a viewer can render a jump strip without loading every page.
 *
 * Derived on read for the same reason as the pages: a stored index would be a
 * second source of truth that could disagree with the file.
 */
export interface SessionTurnIndex {
  totalEntries: number;
  /** Line indices of compaction boundaries, oldest first. */
  compactionAt: number[];
  /** Line indices of assistant turns, oldest first. */
  assistantTurnAt: number[];
  toolCallCount: number;
}

export function readSessionTurnIndex(
  sessionPath: string,
  readFile?: (target: string) => string,
): SessionTurnIndex {
  const read = readFile ?? ((target: string) => readFileSync(target, 'utf8'));
  const lines = read(sessionPath).split('\n').filter((line) => line.trim().length > 0);

  const compactionAt: number[] = [];
  const assistantTurnAt: number[] = [];
  let toolCallCount = 0;

  lines.forEach((line, index) => {
    const parsed = parseLine(line);
    if (!isRecord(parsed)) return;
    if (parsed.type === 'compaction') {
      compactionAt.push(index);
      return;
    }
    if (parsed.type !== 'message' || !isRecord(parsed.message)) return;
    if (parsed.message.role === 'assistant') assistantTurnAt.push(index);
    if (parsed.message.role === 'tool') toolCallCount += 1;
  });

  return { totalEntries: lines.length, compactionAt, assistantTurnAt, toolCallCount };
}
