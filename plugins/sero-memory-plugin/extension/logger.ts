import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type MemoryLogLevel = 'INFO' | 'WARN' | 'ERROR';

const TAG = '[memory]';
const MAX_LOG_SIZE = 1_048_576; // 1 MB

function resolveLogPath(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'debug', 'memory-plugin.log');
}

function ensureLogDir(): void {
  try {
    mkdirSync(path.dirname(resolveLogPath()), { recursive: true });
  } catch {
    // directory may already exist
  }
}

function rotateIfNeeded(logPath: string): void {
  try {
    const { size } = statSync(logPath);
    if (size >= MAX_LOG_SIZE) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {
    // file may not exist yet
  }
}

function serializeData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  try {
    return ` ${JSON.stringify(data)}`;
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

export function log(level: MemoryLogLevel, event: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${event}${serializeData(data)}`;
  const consoleLine = `${TAG} ${line}`;

  if (level === 'ERROR') {
    console.error(consoleLine);
  } else if (level === 'WARN') {
    console.warn(consoleLine);
  } else {
    console.log(consoleLine);
  }

  try {
    const logPath = resolveLogPath();
    ensureLogDir();
    rotateIfNeeded(logPath);
    appendFileSync(logPath, `${line}\n`, 'utf8');
  } catch {
    // logging must never crash the extension
  }
}

export const info = (event: string, data?: Record<string, unknown>) => log('INFO', event, data);
export const warn = (event: string, data?: Record<string, unknown>) => log('WARN', event, data);
export const error = (event: string, data?: Record<string, unknown>) => log('ERROR', event, data);
