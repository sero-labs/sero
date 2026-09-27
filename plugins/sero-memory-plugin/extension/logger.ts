import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { appendRotatingLogLine } from './log-writer';
import { getLocalDayRetentionCutoff, getLocalDayStamp, formatLocalTimestamp, parseLocalDayStamp } from './local-time';
import { resolveMemoryDebugPath } from './state-paths';

/**
 * Error log for the memory plugin. Only errors are written; evaluation data
 * goes to the metrics file instead.
 */

const TAG = '[memory]';
const DAILY_LOG_FILE_RE = /^\d{4}-\d{2}-\d{2}\.log(?:\.\d+)?$/;
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024;
const MAX_FILES_PER_DAY = 3;
const RETENTION_DAYS = 14;
const MAX_PAYLOAD_CHARS = 4_096;
let lastRetentionSweepKey: string | null = null;

function resolveLogPath(date = new Date()): string {
  return resolveMemoryDebugPath(`${getLocalDayStamp(date)}.log`);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const suffix = `…[truncated ${text.length - maxChars} chars]`;
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function serializeData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  try {
    return ` ${truncateText(JSON.stringify(data), MAX_PAYLOAD_CHARS)}`;
  } catch {
    return ' {"serialization":"failed"}';
  }
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { error: String(error) };
}

async function pruneOldDailyLogs(): Promise<void> {
  const now = new Date();
  const logDir = path.dirname(resolveLogPath(now));
  const sweepKey = `${logDir}:${getLocalDayStamp(now)}`;
  if (lastRetentionSweepKey === sweepKey) return;
  lastRetentionSweepKey = sweepKey;
  const entries = await readdir(logDir, { withFileTypes: true }).catch(() => []);
  const cutoff = getLocalDayRetentionCutoff(RETENTION_DAYS, now);

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !DAILY_LOG_FILE_RE.test(entry.name)) return;
    const parsed = parseLocalDayStamp(entry.name.slice(0, 10));
    if (!parsed || parsed >= cutoff) return;
    await rm(path.join(logDir, entry.name), { force: true });
  }));
}

export function error(event: string, data?: Record<string, unknown>): Promise<void> {
  const now = new Date();
  const line = `${formatLocalTimestamp(now)} [ERROR] ${event}${serializeData(data)}`;
  console.error(`${TAG} ${line}`);

  return appendRotatingLogLine({
    filePath: resolveLogPath(now),
    line: `${line}\n`,
    maxBytes: MAX_BYTES_PER_FILE,
    maxFiles: MAX_FILES_PER_DAY,
    warningKey: 'memory-plugin-log',
    warningMessage: '[memory] failed to persist memory log',
    beforeAppend: pruneOldDailyLogs,
  });
}
