/**
 * File-based logger for the cron extension.
 *
 * Writes structured log lines to ~/.sero-ui/apps/cron/cron.log (Sero)
 * or .sero/apps/cron/cron.log (Pi CLI fallback). Rotates at 1 MB.
 *
 * Always logs to console as well so errors appear in
 * /tmp/sero-electron.log even if the file logger isn't initialised.
 */

import { appendFileSync, statSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const TAG = '[cron]';
const CHANNEL = 'cron';
const MAX_LOG_SIZE = 1_048_576; // 1 MB

let logFilePath: string | null = null;
let piRef: ExtensionAPI | null = null;

// ── Setup ──────────────────────────────────────────────────────

/** Initialise the logger. Call once from the extension entry point. */
export function initLogger(pi: ExtensionAPI, statePath: string): void {
  piRef = pi;
  logFilePath = path.join(path.dirname(statePath), 'cron.log');

  try {
    mkdirSync(path.dirname(logFilePath), { recursive: true });
  } catch {
    // directory may already exist
  }
}

/** Update the log path (e.g. on session_switch). */
export function setLogPath(statePath: string): void {
  logFilePath = path.join(path.dirname(statePath), 'cron.log');
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

  // ── Console (always — shows up in /tmp/sero-electron.log) ─
  const consoleLine = `${TAG} ${line}`;
  if (level === 'ERROR') {
    console.error(consoleLine);
  } else if (level === 'WARN') {
    console.warn(consoleLine);
  } else {
    console.log(consoleLine);
  }

  // ── File ──────────────────────────────────────────────────
  if (logFilePath) {
    try {
      rotateIfNeeded();
      appendFileSync(logFilePath, line + '\n', 'utf8');
    } catch {
      // Swallow — logging must never crash the extension
    }
  }

  // ── Event bus (for host / other extensions) ───────────────
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
    // File may not exist yet — that's fine
  }
}

// ── Convenience helpers ────────────────────────────────────────

export const info = (event: string, data?: Record<string, unknown>) =>
  log('INFO', event, data);

export const warn = (event: string, data?: Record<string, unknown>) =>
  log('WARN', event, data);

export const error = (event: string, data?: Record<string, unknown>) =>
  log('ERROR', event, data);
