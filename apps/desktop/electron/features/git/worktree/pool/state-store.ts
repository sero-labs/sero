/**
 * Versioned, atomically replaced pool state.
 *
 * Reads fail closed. A truncated, corrupt, or unknown-version state file makes
 * the repository unavailable for automatic pool use; it is never replaced with
 * an empty, reusable pool, because "no slots" and "we cannot read the slots"
 * have opposite consequences for work already on disk. Corrupt bytes are
 * COPIED aside for diagnosis and the unreadable file is left in place, so
 * every later read reaches the same fail-closed answer instead of finding a
 * conveniently empty directory.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AppRuntimeWorktreeLease } from '@sero-ai/common';
import { POOL_SCHEMA_VERSION, type PoolSlot, type PoolState } from './types';
import { migratePoolState, validatePoolState } from './validate-state';

export type PoolStateRead =
  | { status: 'ok'; state: PoolState; migrated: boolean }
  /** No state file yet. A first-use pool for this repository is safe to create. */
  | { status: 'empty' }
  | { status: 'unavailable'; reason: string };

async function preserveCorruptState(statePath: string, raw: string): Promise<void> {
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  const target = `${statePath}.corrupt-${digest}`;
  try {
    await fs.writeFile(target, raw, { encoding: 'utf8', flag: 'wx' });
  } catch {
    // Already preserved, or the directory is unwritable. Diagnosis is
    // best-effort; the fail-closed read below is what protects the work.
  }
}

export async function readPoolState(
  statePath: string,
  options: { preserveCorrupt?: boolean } = {},
): Promise<PoolStateRead> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'empty' };
    return { status: 'unavailable', reason: `Could not read pool state: ${String(error)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (options.preserveCorrupt !== false) await preserveCorruptState(statePath, raw);
    return {
      status: 'unavailable',
      reason: options.preserveCorrupt === false
        ? 'Pool state is not valid JSON.'
        : 'Pool state is not valid JSON. It was preserved for diagnosis.',
    };
  }

  const migration = migratePoolState(parsed);
  const validated = validatePoolState(migration.value);
  if (validated.status === 'invalid') {
    if (options.preserveCorrupt !== false) await preserveCorruptState(statePath, raw);
    return {
      status: 'unavailable',
      reason: options.preserveCorrupt === false
        ? validated.reason
        : `${validated.reason} The file was preserved for diagnosis.`,
    };
  }
  if (validated.state.version !== POOL_SCHEMA_VERSION) {
    return {
      status: 'unavailable',
      reason: `Pool state version ${validated.state.version} is not version ${POOL_SCHEMA_VERSION}. `
        + 'A newer Sero may own this repository.',
    };
  }
  return { status: 'ok', state: validated.state, migrated: migration.migrated };
}

/**
 * Writes state through a unique temporary file in the same directory, flushes
 * it, then replaces the target by rename. A reader therefore sees either the
 * whole previous state or the whole new one.
 */
export async function writePoolState(statePath: string, state: PoolState): Promise<PoolState> {
  const next: PoolState = { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const handle = await fs.open(tmpPath, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmpPath, statePath);
  return next;
}

/** Removes temporary files this process abandoned; leaves anything recent alone. */
export async function cleanAbandonedTempFiles(statePath: string, staleMs = 60_000): Promise<void> {
  const dir = path.dirname(statePath);
  const prefix = `${path.basename(statePath)}.tmp-`;
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(entries.map(async (name) => {
    if (!name.startsWith(prefix)) return;
    const file = path.join(dir, name);
    const stats = await fs.stat(file).catch(() => null);
    if (!stats || Date.now() - stats.mtimeMs < staleMs) return;
    await fs.rm(file, { force: true }).catch(() => undefined);
  }));
}

export function replaceSlot(state: PoolState, slot: PoolSlot): PoolState {
  const slots = state.slots.some((candidate) => candidate.slotId === slot.slotId)
    ? state.slots.map((candidate) => (candidate.slotId === slot.slotId ? slot : candidate))
    : [...state.slots, slot];
  return { ...state, slots };
}

export function dropSlot(state: PoolState, slotId: string): PoolState {
  return { ...state, slots: state.slots.filter((slot) => slot.slotId !== slotId) };
}

export function findSlot(state: PoolState, slotId: string): PoolSlot | undefined {
  return state.slots.find((slot) => slot.slotId === slotId);
}

export function leaseOf(slot: PoolSlot | undefined): AppRuntimeWorktreeLease | null {
  return slot?.lease ?? null;
}
