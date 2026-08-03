import type { DesignLibraryPaths } from './paths';
import { readJsonFile, updateState, withRecordLock, writeJsonFile } from './state-io';

export async function readIndex<T>(
  filePath: string,
  normalize: (value: unknown) => T[],
): Promise<T[]> {
  return normalize(await readJsonFile<unknown>(filePath));
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Update one compact index under its cross-process lock. The caller holds the
 * entity record lock, which establishes the order record, index, control state.
 */
export async function updateIndex<T extends { id: string }>(
  paths: DesignLibraryPaths,
  filePath: string,
  normalize: (value: unknown) => T[],
  id: string,
  entry: T | null,
): Promise<boolean> {
  return withRecordLock(paths, filePath, async () => {
    const current = await readIndex(filePath, normalize);
    const existing = current.find((candidate) => candidate.id === id);
    if (entry !== null && existing !== undefined && sameValue(existing, entry)) return false;
    if (entry === null && existing === undefined) return false;
    const next = entry === null
      ? current.filter((candidate) => candidate.id !== id)
      : existing === undefined
        ? [...current, entry]
        : current.map((candidate) => candidate.id === id ? entry : candidate);
    await writeJsonFile(filePath, next);
    return true;
  });
}

export async function replaceIndex<T>(
  paths: DesignLibraryPaths,
  filePath: string,
  normalize: (value: unknown) => T[],
  entries: T[],
): Promise<boolean> {
  return withRecordLock(paths, filePath, async () => {
    const raw = await readJsonFile<unknown>(filePath);
    const current = normalize(raw);
    if (raw !== null && sameValue(current, entries)) return false;
    await writeJsonFile(filePath, entries);
    return true;
  });
}

/** Notify detail views after the record and its index are durable. */
export async function bumpControlRevision(paths: DesignLibraryPaths): Promise<void> {
  await updateState(paths, (state) => state);
}
