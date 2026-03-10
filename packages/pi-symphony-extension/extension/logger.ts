/**
 * Structured logging for the Symphony extension.
 *
 * Writes to ~/.sero-ui/apps/symphony/symphony.log (Sero) or
 * .sero/apps/symphony/symphony.log (Pi CLI fallback). Rotates at 1 MB.
 *
 * Format: ISO [LEVEL] event_name {context fields}
 */

import { appendFileSync, statSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const TAG = '[symphony]';
const CHANNEL = 'symphony';
const MAX_LOG_SIZE = 1_048_576; // 1 MB

let logFilePath: string | null = null;
let piRef: ExtensionAPI | null = null;

// ── Setup ──────────────────────────────────────────────────────

export function initLogger(pi: ExtensionAPI, statePath: string): void {
  piRef = pi;
  logFilePath = path.join(path.dirname(statePath), 'symphony.log');

  try {
    mkdirSync(path.dirname(logFilePath), { recursive: true });
  } catch {
    // directory may already exist
  }
}

export function setLogPath(statePath: string): void {
  logFilePath = path.join(path.dirname(statePath), 'symphony.log');
}

// ── Core ───────────────────────────────────────────────────────

export function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  const line = `${ts} [${level}] ${event}${payload}`;

  // Console (always — shows up in /tmp/sero-electron.log)
  const consoleLine = `${TAG} ${line}`;
  if (level === 'ERROR') {
    console.error(consoleLine);
  } else if (level === 'WARN') {
    console.warn(consoleLine);
  } else {
    console.log(consoleLine);
  }

  // File
  if (logFilePath) {
    try {
      rotateIfNeeded();
      appendFileSync(logFilePath, line + '\n', 'utf8');
    } catch {
      // logging must never crash the extension
    }
  }

  // Event bus
  try {
    piRef?.events.emit('log', { channel: CHANNEL, event, level, data });
  } catch {
    // event bus may not be ready
  }
}

// ── Rotation ───────────────────────────────────────────────────

function rotateIfNeeded(): void {
  if (!logFilePath) return;
  try {
    const { size } = statSync(logFilePath);
    if (size >= MAX_LOG_SIZE) {
      renameSync(logFilePath, `${logFilePath}.1`);
    }
  } catch {
    // file may not exist yet
  }
}

// ── Convenience helpers ────────────────────────────────────────

export const info = (event: string, data?: Record<string, unknown>) =>
  log('INFO', event, data);

export const warn = (event: string, data?: Record<string, unknown>) =>
  log('WARN', event, data);

export const error = (event: string, data?: Record<string, unknown>) =>
  log('ERROR', event, data);
