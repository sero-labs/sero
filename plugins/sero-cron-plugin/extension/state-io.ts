/**
 * State file I/O — path resolution, reading, writing, and mutex.
 *
 * Extracted from index.ts to keep the main file under 500 LOC.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CronState } from '../shared/types';
import { DEFAULT_CRON_STATE } from '../shared/types';

// ── Path resolution ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'cron', 'state.json');

export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) return path.join(seroHome, 'apps', 'cron', 'state.json');
  return path.join(cwd, STATE_REL_PATH);
}

// ── Mutex ──────────────────────────────────────────────────────

let stateMutexQueue: Promise<void> = Promise.resolve();

export function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = stateMutexQueue;
  let resolve: () => void;
  stateMutexQueue = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

// ── Read / Write ───────────────────────────────────────────────

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function createStateReadError(filePath: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Cron state file at ${filePath} is unreadable. Repair or remove the malformed file before retrying. Original error: ${detail}`,
  );
}

function normalizeCronState(raw: Partial<CronState>): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    ...raw,
    jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
    reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
    lastRunResults: Array.isArray(raw.lastRunResults) ? raw.lastRunResults : [],
  };
}

export async function readState(filePath: string): Promise<CronState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeCronState(JSON.parse(raw) as Partial<CronState>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return normalizeCronState(DEFAULT_CRON_STATE);
    }
    throw createStateReadError(filePath, error);
  }
}

export async function writeState(filePath: string, state: CronState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
