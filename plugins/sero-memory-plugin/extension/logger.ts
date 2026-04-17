import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { appendRotatingLogLine } from './log-writer';
import { getMemoryLoggingSettingsSync } from './logger-settings';
import { resolveMemoryDebugPath } from './state-paths';

export type MemoryLogLevel = 'INFO' | 'WARN' | 'ERROR';

const TAG = '[memory]';
const DAILY_LOG_FILE_RE = /^\d{4}-\d{2}-\d{2}\.log(?:\.\d+)?$/;
let lastRetentionSweepKey: string | null = null;

function getUtcDayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveLogPath(date = new Date()): string {
  return resolveMemoryDebugPath(`${getUtcDayStamp(date)}.log`);
}

function resolveLogDir(): string {
  return path.dirname(resolveLogPath());
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const suffix = `…[truncated ${text.length - maxChars} chars]`;
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function serializeData(data: Record<string, unknown> | undefined, maxPayloadChars: number): string {
  if (!data) return '';
  try {
    return ` ${truncateText(JSON.stringify(data), maxPayloadChars)}`;
  } catch {
    return ' {"serialization":"failed"}';
  }
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error: String(error) };
}

export function getMemoryLogPath(): string {
  return resolveLogPath();
}

export function getMemoryLogDirPath(): string {
  return resolveLogDir();
}

async function pruneOldDailyLogs(retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return;

  const sweepDay = getUtcDayStamp(new Date());
  const logDir = resolveLogDir();
  const sweepKey = `${logDir}:${sweepDay}`;
  if (lastRetentionSweepKey === sweepKey) return;
  lastRetentionSweepKey = sweepKey;
  const entries = await readdir(logDir, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !DAILY_LOG_FILE_RE.test(entry.name)) return;

    const day = entry.name.slice(0, 10);
    const parsed = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(parsed) || parsed >= cutoff) return;

    await rm(path.join(logDir, entry.name), { force: true });
  }));
}

export function log(level: MemoryLogLevel, event: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const settings = getMemoryLoggingSettingsSync();
  const line = `${ts} [${level}] ${event}${serializeData(data, settings.maxPayloadChars)}`;
  const consoleLine = `${TAG} ${line}`;

  if (level === 'ERROR') {
    console.error(consoleLine);
  } else if (level === 'WARN') {
    console.warn(consoleLine);
  } else {
    console.log(consoleLine);
  }

  appendRotatingLogLine({
    filePath: resolveLogPath(),
    line: `${line}\n`,
    maxBytes: settings.maxBytesPerFile,
    maxFiles: settings.maxFilesPerDay,
    warningKey: 'memory-plugin-log',
    warningMessage: '[memory] failed to persist memory log',
    beforeAppend: async () => pruneOldDailyLogs(settings.retentionDays),
  });
}

export const info = (event: string, data?: Record<string, unknown>) => log('INFO', event, data);
export const warn = (event: string, data?: Record<string, unknown>) => log('WARN', event, data);
export const error = (event: string, data?: Record<string, unknown>) => log('ERROR', event, data);
