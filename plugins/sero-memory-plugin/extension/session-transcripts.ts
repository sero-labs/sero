import os from 'node:os';
import path from 'node:path';
import { format } from 'date-fns';

import {
  SessionManager,
  type SessionMessageEntry,
} from '@earendil-works/pi-coding-agent';

import {
  getSessionTranscriptPath,
  readFile,
  resolveMemoryRoot,
  todayStr,
  writeFile,
} from './memory-manager';
import { error, errorDetails, info } from './logger';
import { resolveSessionStoreDir } from './agent-dir';

const TRANSCRIPT_SECTION_MAX_CHARS = 4_000;

let backfillCompleted = false;
let backfillPromise: Promise<{ exported: number; skipped: number }> | null = null;

type SessionTranscriptManager = Pick<
  SessionManager,
  'getBranch' | 'getSessionId' | 'getHeader'
>;

export function getSessionStoreDir(): string {
  return resolveSessionStoreDir();
}

function resolveTranscriptDate(sessionManager: SessionTranscriptManager): string {
  const timestamp = sessionManager.getHeader()?.timestamp;
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    const d = new Date(timestamp);
    if (!Number.isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
    return timestamp.slice(0, 10);
  }
  return todayStr();
}

function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return format(date, 'HH:mm');
}

function truncateTranscriptSection(text: string): string {
  if (text.length <= TRANSCRIPT_SECTION_MAX_CHARS) return text;
  return [
    text.slice(0, TRANSCRIPT_SECTION_MAX_CHARS),
    '',
    `_[truncated: showing ${TRANSCRIPT_SECTION_MAX_CHARS} of ${text.length} chars]_`,
  ].join('\n');
}

function textContentToString(content: string | Array<{ type: string; text?: string; mediaType?: string }>): string {
  if (typeof content === 'string') return content.trim();

  return content
    .map((block) => {
      if (block.type === 'text') return block.text?.trim() ?? '';
      if (block.type === 'image') return `[Image${block.mediaType ? `: ${block.mediaType}` : ''}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function assistantContentToString(
  content: Array<{ type: string; text?: string; toolName?: string }>,
  errorMessage?: string,
): string {
  const textParts = content
    .filter((block) => block.type === 'text' && block.text?.trim())
    .map((block) => block.text!.trim());
  if (textParts.length > 0) return textParts.join('\n\n');

  const toolNames = [...new Set(
    content
      .filter((block) => block.type === 'toolCall')
      .map((block) => block.toolName)
      .filter((value): value is string => Boolean(value)),
  )];
  if (toolNames.length > 0) return `_Called tools: ${toolNames.join(', ')}_`;
  if (errorMessage?.trim()) return `_Assistant error: ${errorMessage.trim()}_`;
  return '';
}

function bashExecutionToMarkdown(message: {
  command: string;
  output: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
}): string {
  const parts = [`**Command:** \`${message.command}\``];
  const output = truncateTranscriptSection(message.output.trim());
  if (output) {
    parts.push(['**Output:**', '```text', output, '```'].join('\n'));
  }

  const statusBits: string[] = [];
  if (typeof message.exitCode === 'number') statusBits.push(`exit ${message.exitCode}`);
  if (message.cancelled) statusBits.push('cancelled');
  if (message.truncated) statusBits.push('tool-truncated');
  if (statusBits.length > 0) parts.push(`**Status:** ${statusBits.join(', ')}`);

  return parts.join('\n\n');
}

function formatTranscriptSection(label: string, timestamp: number, body: string): string {
  const normalized = body.trim();
  if (!normalized) return '';
  return [`## ${label} (${formatClockTime(timestamp)})`, '', truncateTranscriptSection(normalized)].join('\n');
}

function formatTranscriptMessage(entry: SessionMessageEntry): string {
  const message = entry.message;

  switch (message.role) {
    case 'user':
      return formatTranscriptSection('User', message.timestamp, textContentToString(message.content));
    case 'assistant':
      return formatTranscriptSection(
        'Assistant',
        message.timestamp,
        assistantContentToString(
          message.content as Array<{ type: string; text?: string; toolName?: string }>,
          message.errorMessage,
        ),
      );
    case 'toolResult':
      return formatTranscriptSection(
        `Tool: ${message.toolName}`,
        message.timestamp,
        textContentToString(message.content),
      );
    case 'bashExecution':
      return formatTranscriptSection('Bash', message.timestamp, bashExecutionToMarkdown(message));
    case 'custom':
      if (!message.display) return '';
      return formatTranscriptSection(
        `Custom: ${message.customType}`,
        message.timestamp,
        textContentToString(message.content as string | Array<{ type: string; text?: string; mediaType?: string }>),
      );
    default:
      return '';
  }
}

function buildTranscriptMarkdown(
  entries: SessionMessageEntry[],
  sessionId: string,
  date: string,
): string {
  const sections = entries
    .map((entry) => formatTranscriptMessage(entry))
    .filter((section) => section.trim());

  return [
    `# Session ${date} (${sessionId.slice(0, 8)})`,
    '',
    '<!-- source: transcript -->',
    `<!-- session-id: ${sessionId} -->`,
    '',
    ...sections,
  ].join('\n');
}

export interface SessionTranscriptExportResult {
  changed: boolean;
  path?: string;
  reason?: 'no_messages' | 'unchanged';
}

export async function exportTranscriptForSession(
  sessionManager: SessionTranscriptManager,
  source: string,
): Promise<SessionTranscriptExportResult> {
  const branch = sessionManager.getBranch();
  const messageEntries = branch.filter(
    (entry: (typeof branch)[number]): entry is SessionMessageEntry => entry.type === 'message',
  );
  if (messageEntries.length === 0) {
    info('session_transcript_skipped', { source, reason: 'no_messages' });
    return { changed: false, reason: 'no_messages' };
  }

  const sessionId = sessionManager.getSessionId();
  const date = resolveTranscriptDate(sessionManager);
  const transcriptPath = getSessionTranscriptPath(resolveMemoryRoot(), date, sessionId);
  const transcript = buildTranscriptMarkdown(messageEntries, sessionId, date);
  const existing = await readFile(transcriptPath);
  if (existing === transcript) {
    info('session_transcript_skipped', {
      source,
      sessionId,
      path: transcriptPath,
      reason: 'unchanged',
    });
    return { changed: false, path: transcriptPath, reason: 'unchanged' };
  }

  await writeFile(transcriptPath, transcript);
  info('session_transcript_exported', {
    source,
    sessionId,
    path: transcriptPath,
    messageCount: messageEntries.length,
  });
  return { changed: true, path: transcriptPath };
}

async function runBackfill(): Promise<{ exported: number; skipped: number }> {
  const sessionDir = getSessionStoreDir();
  const sessionInfos = await SessionManager.list(os.homedir(), sessionDir).catch((err) => {
    error('session_transcript_backfill_list_failed', errorDetails(err));
    return [];
  });

  let exported = 0;
  let skipped = 0;
  for (const infoRecord of sessionInfos) {
    try {
      const manager = SessionManager.open(infoRecord.path, sessionDir);
      const result = await exportTranscriptForSession(manager, 'backfill');
      if (result.changed) exported += 1;
      else skipped += 1;
    } catch (err) {
      error('session_transcript_backfill_open_failed', {
        sessionPath: infoRecord.path,
        ...errorDetails(err),
      });
    }
  }

  backfillCompleted = true;
  info('session_transcript_backfill_complete', { sessionDir, exported, skipped });
  return { exported, skipped };
}

/**
 * Start backfill as a background task (fire-and-forget from session_start).
 * Returns immediately. Use `backfillSessionTranscripts()` to await the result.
 */
export function startBackfillInBackground(): void {
  if (backfillCompleted || backfillPromise) return;
  backfillPromise = runBackfill().catch((err) => {
    error('session_transcript_backfill_background_failed', errorDetails(err));
    backfillCompleted = true;
    return { exported: 0, skipped: 0 };
  });
}

/**
 * Await the backfill result. If already started in background, awaits
 * the existing promise. If not started yet, runs inline.
 */
export async function backfillSessionTranscripts(): Promise<{
  exported: number;
  skipped: number;
}> {
  if (backfillCompleted) return { exported: 0, skipped: 0 };
  if (backfillPromise) return backfillPromise;
  backfillPromise = runBackfill();
  return backfillPromise;
}
