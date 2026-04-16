import { appendRotatingLogLine } from './log-writer';
import { resolveMemoryDebugPath } from './state-paths';

export type MemoryLogLevel = 'INFO' | 'WARN' | 'ERROR';

const TAG = '[memory]';
const MAX_LOG_SIZE = 1_048_576; // 1 MB

function resolveLogPath(): string {
  return resolveMemoryDebugPath('memory-plugin.log');
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

  appendRotatingLogLine({
    filePath: resolveLogPath(),
    line: `${line}\n`,
    maxBytes: MAX_LOG_SIZE,
    warningKey: 'memory-plugin-log',
    warningMessage: '[memory] failed to persist memory-plugin.log',
  });
}

export const info = (event: string, data?: Record<string, unknown>) => log('INFO', event, data);
export const warn = (event: string, data?: Record<string, unknown>) => log('WARN', event, data);
export const error = (event: string, data?: Record<string, unknown>) => log('ERROR', event, data);
