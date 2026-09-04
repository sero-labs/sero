/**
 * Session search for the gateway.
 *
 * Two tiers. Tier 1 matches the session name and its first message, which
 * the listing metadata already holds. Tier 2 reads the session JSONL and
 * looks for the query in message text.
 *
 * The scan is a plain case-insensitive substring match. At the current
 * scale that is fast enough, and it needs no index to build or keep
 * fresh. An index would slot in behind `scanSessionFile`.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { GatewaySessionSearchResult } from '@electron/features/gateway/server/types';

/** Sessions read from disk per request. Newest first, so the cap bites oldest. */
export const MAX_SESSIONS_SCANNED = 200;

/** Bytes read from one session before the scan gives up on it. */
export const MAX_BYTES_PER_SESSION = 2 * 1024 * 1024;

/** Results returned per request. */
export const MAX_RESULTS = 20;

/** Characters of context kept around a match. */
const SNIPPET_RADIUS = 60;

export interface SearchableSession {
  id: string;
  workspaceId: string;
  name: string;
  firstMessage: string;
  updatedAt: string;
  messageCount: number;
  /** Absolute path of the session JSONL. */
  path: string;
}

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

/** One line of context around the first match, with the ends marked. */
export function buildSnippet(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/** Tier 1: the metadata a listing already carries. */
function matchMetadata(
  session: SearchableSession,
  needle: string,
): GatewaySessionSearchResult | null {
  const haystacks = [session.name, session.firstMessage];
  for (const haystack of haystacks) {
    const index = haystack.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    return {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      name: session.name || session.firstMessage,
      snippet: buildSnippet(haystack, index, needle.length),
      matchCount: 1,
      updatedAt: session.updatedAt,
    };
  }
  return null;
}

/** Tier 2: the message bodies on disk, up to the per-session byte cap. */
async function scanSessionFile(
  session: SearchableSession,
  needle: string,
): Promise<GatewaySessionSearchResult | null> {
  let bytesRead = 0;
  let matchCount = 0;
  let snippet = '';

  const lines = createInterface({
    input: createReadStream(session.path),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      bytesRead += Buffer.byteLength(line, 'utf8') + 1;
      if (bytesRead > MAX_BYTES_PER_SESSION) break;
      if (!line.trim()) continue;

      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(entry) || entry.type !== 'message' || !isRecord(entry.message)) continue;

      const text = textFromContent(entry.message.content);
      const index = text.toLowerCase().indexOf(needle);
      if (index === -1) continue;

      matchCount += 1;
      if (!snippet) snippet = buildSnippet(text, index, needle.length);
    }
  } catch {
    // An unreadable session is not a failed search.
    return null;
  } finally {
    lines.close();
  }

  if (matchCount === 0) return null;

  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    name: session.name || session.firstMessage,
    snippet,
    matchCount,
    updatedAt: session.updatedAt,
  };
}

/**
 * Search sessions for `query`, newest first.
 *
 * `sessions` must already be limited to what the caller's token can
 * reach: this function applies no authorization of its own.
 */
export async function searchSessions(
  sessions: SearchableSession[],
  query: string,
  limit = MAX_RESULTS,
): Promise<GatewaySessionSearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const ordered = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const scannable = ordered.slice(0, MAX_SESSIONS_SCANNED);
  const cap = Math.min(Math.max(limit, 1), MAX_RESULTS);
  const results: GatewaySessionSearchResult[] = [];

  for (const session of scannable) {
    if (results.length >= cap) break;

    const metadataMatch = matchMetadata(session, needle);
    if (metadataMatch) {
      results.push(metadataMatch);
      continue;
    }

    const contentMatch = await scanSessionFile(session, needle);
    if (contentMatch) results.push(contentMatch);
  }

  return results;
}
