/**
 * State file I/O — path resolution, reading, writing, and mutex.
 *
 * Symphony is global-scoped: state lives at ~/.sero-ui/apps/symphony/state.json
 * (Sero) or .sero/apps/symphony/state.json relative to cwd (Pi CLI fallback).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SymphonyState } from '../shared/types';
import { DEFAULT_SYMPHONY_STATE } from '../shared/types';

// ── Path resolution ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'symphony', 'state.json');

export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) return path.join(seroHome, 'apps', 'symphony', 'state.json');
  return path.join(cwd, STATE_REL_PATH);
}

// ── Mutex ──────────────────────────────────────────────────────

let stateMutexQueue: Promise<void> = Promise.resolve();

export function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = stateMutexQueue;
  let resolve: () => void;
  stateMutexQueue = new Promise<void>((r) => {
    resolve = r;
  });
  return prev.then(fn).finally(() => resolve!());
}

// ── Read / Write ───────────────────────────────────────────────

export async function readState(filePath: string): Promise<SymphonyState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as SymphonyState;
  } catch {
    return { ...DEFAULT_SYMPHONY_STATE };
  }
}

export async function writeState(
  filePath: string,
  state: SymphonyState,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
