/**
 * State file I/O — path resolution, reading, writing, and mutex.
 *
 * Extracted from index.ts to keep the main file under 500 LOC.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { withStateLock as withSharedStateLock } from '@sero-ai/extension-runtime';
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

/**
 * Cross-process lock on `<statePath>.lock`, shared with the Sero host's
 * AppStateManager. An in-process queue is not enough: the UI writes this file
 * through the host in another process, and an unshared mutex excludes
 * nothing (#428). Also serialises writers inside this process.
 */
export function withStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  return withSharedStateLock(statePath, fn);
}

// ── Read / Write ───────────────────────────────────────────────

const writeQueues = new Map<string, Promise<void>>();

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
  await enqueueFileWrite(filePath, async () => {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    await replaceFile(tmpPath, filePath);
  });
}

async function enqueueFileWrite(filePath: string, write: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  writeQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  }
}

// Codes Windows raises when a virus scanner or search indexer briefly holds the
// destination open. They are transient, so retrying the rename clears them.
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function replaceFile(tmpPath: string, filePath: string): Promise<void> {
  // fs.rename replaces the destination atomically on every platform, so retry
  // transient Windows lock errors rather than deleting the destination first —
  // a delete-then-rename would briefly expose a missing file to concurrent
  // readers, who would fall back to empty state.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 9 || !code || !RENAME_RETRY_CODES.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
