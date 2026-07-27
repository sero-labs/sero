/**
 * Authoritative serialisation for the reactive index and for every full
 * record on disk.
 *
 * Two independent processes can write here: Pi extension tools (agent session
 * or Pi CLI) and the Sero background runtime. Atomic replacement alone would
 * still lose updates, so every write is a compare-and-swap on a monotonic
 * revision counter:
 *
 *   read → apply updater → re-read → verify revision unchanged → rename
 *
 * A stale writer loses the CAS and retries against the newer document, so it
 * can never clobber a concurrent write.
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withFileLock } from './file-lock';
import { DEFAULT_STATE, type DesignLibraryState } from './state';

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

const MAX_ATTEMPTS = 12;

async function readJson<T>(filePath: string): Promise<T | null> {
  const raw = await readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, filePath).catch(async (error: unknown) => {
    await unlink(temp).catch(() => undefined);
    throw error;
  });
}

/** Anything guarded by the compare-and-swap loop carries a revision. */
export interface Revisioned {
  revision: number;
}

export async function readState(stateFile: string): Promise<DesignLibraryState | null> {
  return readJson<DesignLibraryState>(stateFile);
}

/**
 * Apply `updater` to the reactive index under a revision compare-and-swap.
 * The updater must be pure — it may run several times.
 */
export async function mutateState(
  stateFile: string,
  updater: (current: DesignLibraryState) => DesignLibraryState,
): Promise<DesignLibraryState> {
  return withFileLock(stateFile, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const current = (await readState(stateFile)) ?? structuredClone(DEFAULT_STATE);
      const next = updater(structuredClone(current));
      const published: DesignLibraryState = {
        ...next,
        schemaVersion: DEFAULT_STATE.schemaVersion,
        stateRevision: current.stateRevision + 1,
      };

      // Second layer: an unlocked external writer (a hand edit, an older
      // build) still cannot be overwritten silently.
      const witness = await readState(stateFile);
      if ((witness?.stateRevision ?? 0) !== current.stateRevision) continue;

      await writeJsonAtomic(stateFile, published);
      return published;
    }

    throw new ConcurrencyError('Design Library state is being written by another process.');
  });
}

export async function readRecord<T extends Revisioned>(filePath: string): Promise<T | null> {
  return readJson<T>(filePath);
}

/**
 * Compare-and-swap write for one full record. `updater` receives `null` when
 * the record does not exist yet.
 */
export async function mutateRecord<T extends Revisioned>(
  filePath: string,
  updater: (current: T | null) => T,
): Promise<T> {
  return withFileLock(filePath, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const current = await readRecord<T>(filePath);
      const next = updater(current ? structuredClone(current) : null);
      const published = { ...next, revision: (current?.revision ?? 0) + 1 };

      const witness = await readRecord<T>(filePath);
      if ((witness?.revision ?? 0) !== (current?.revision ?? 0)) continue;

      await writeJsonAtomic(filePath, published);
      return published;
    }

    throw new ConcurrencyError(`Record is being written by another process: ${filePath}`);
  });
}

/**
 * Publish an immutable document (Gallery snapshots, job files). No revision
 * guard — the caller owns a fresh path that nothing else writes.
 */
export async function publishJson(filePath: string, value: unknown): Promise<void> {
  await writeJsonAtomic(filePath, value);
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  return readJson<T>(filePath);
}
