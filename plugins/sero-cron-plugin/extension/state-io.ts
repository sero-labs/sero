/**
 * State file I/O — path resolution, reading, writing, and mutex.
 *
 * Extracted from index.ts to keep the main file under 500 LOC.
 */

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

export async function readState(filePath: string): Promise<CronState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CronState;
    if (!parsed.reminders) parsed.reminders = [];
    return parsed;
  } catch {
    return { ...DEFAULT_CRON_STATE, jobs: [], reminders: [], lastRunResults: [] };
  }
}

export async function writeState(filePath: string, state: CronState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
