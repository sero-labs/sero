/**
 * File-based logger for the cron extension.
 *
 * Writes structured log lines to ~/.sero-ui/apps/cron/cron.log (Sero)
 * or .sero/apps/cron/cron.log (Pi CLI fallback). Rotates at 1 MB.
 *
 * Always logs to console as well so errors appear in
 * /tmp/sero-electron.log even if the file logger isn't initialised.
 */

import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type LoggerEventBus = Pick<ExtensionAPI, 'events'>;

const TAG = '[cron]';
const CHANNEL = 'cron';
const MAX_LOG_SIZE = 1_048_576; // 1 MB

let logFilePath: string | null = null;
let piRef: LoggerEventBus | null = null;
let fileWriteQueue: Promise<void> = Promise.resolve();
let fileLoggingHealthy = true;

// ── Setup ──────────────────────────────────────────────────────

/** Initialise the logger. Call once from the extension entry point. */
export function initLogger(pi: LoggerEventBus, statePath: string): void {
  piRef = pi;
  logFilePath = path.join(path.dirname(statePath), 'cron.log');
  fileLoggingHealthy = true;
}

/** Update the log path when a session activation changes cwd. */
export function setLogPath(statePath: string): void {
  logFilePath = path.join(path.dirname(statePath), 'cron.log');
  fileLoggingHealthy = true;
}

// ── Core ───────────────────────────────────────────────────────

/** Write a structured log entry. */
export function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  const line = `${ts} [${level}] ${event}${payload}`;

  logToConsole(level, line);

  if (logFilePath) {
    const targetPath = logFilePath;
    fileWriteQueue = fileWriteQueue
      .then(async () => {
        await appendLogLine(targetPath, line);
        fileLoggingHealthy = true;
      })
      .catch((error) => {
        reportFileLoggingFailure(targetPath, error);
      });
  }

  emitLogEvent(event, level, data);
}

async function appendLogLine(filePath: string, line: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath);
  await appendFile(filePath, `${line}\n`, 'utf8');
}

function logToConsole(level: LogLevel, line: string): void {
  const consoleLine = `${TAG} ${line}`;
  if (level === 'ERROR') {
    console.error(consoleLine);
    return;
  }
  if (level === 'WARN') {
    console.warn(consoleLine);
    return;
  }
  console.log(consoleLine);
}

function reportFileLoggingFailure(filePath: string, error: unknown): void {
  if (!fileLoggingHealthy) {
    return;
  }
  fileLoggingHealthy = false;

  const details = {
    path: filePath,
    error: formatError(error),
  };
  console.warn(`${TAG} file logging unavailable ${JSON.stringify(details)}`);
  emitLogEvent('logger:file-unavailable', 'WARN', details);
}

function emitLogEvent(
  event: string,
  level: LogLevel,
  data?: Record<string, unknown>,
): void {
  try {
    piRef?.events.emit('log', { channel: CHANNEL, event, level, data });
  } catch {
    // event bus may not be ready
  }
}

// ── Rotation ───────────────────────────────────────────────────

async function rotateIfNeeded(filePath: string): Promise<void> {
  try {
    const { size } = await stat(filePath);
    if (size >= MAX_LOG_SIZE) {
      await rename(filePath, `${filePath}.1`);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function flushLoggerWrites(): Promise<void> {
  await fileWriteQueue;
}

// ── Convenience helpers ────────────────────────────────────────

export const info = (event: string, data?: Record<string, unknown>) =>
  log('INFO', event, data);

export const warn = (event: string, data?: Record<string, unknown>) =>
  log('WARN', event, data);

export const error = (event: string, data?: Record<string, unknown>) =>
  log('ERROR', event, data);
