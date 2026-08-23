import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { withLock, type FileLockOptions } from '@sero-ai/extension-runtime';
import {
  normalizeDesignIndex,
  normalizeExportIndex,
  normalizeGalleryIndex,
  normalizeItemIndex,
  normalizeJobIndex,
  type EntityIndexes,
} from './indexes';
import type { DesignLibraryPaths } from './paths';
import type { LibraryRequestBody } from './requests';
import type { DesignLibraryState } from './types';
import { DEFAULT_STATE, normalizeState } from './types';

/**
 * The one authoritative serialisation path for reactive state.
 *
 * Three layers, each covering a gap the others leave open:
 *
 * 1. An in-process queue per file, so concurrent writers inside one process
 *    serialise instead of interleaving their read-modify-write cycles.
 * 2. A cross-process lock, because Pi tool calls run in a different process
 *    from the host runtime and cannot see the queue.
 * 3. A revision compare-and-swap, so a writer holding state it read earlier —
 *    outside any lock — is rejected rather than silently clobbering newer work.
 *
 * Layers 1 and 2 are not exclusive to reactive state. Item and job records are
 * separate files with the same read-modify-write hazard — an analysis result
 * landing while the user edits the same item — so `withRecordLock` below gives
 * them the identical treatment, keyed per record. Records need no revision
 * counter: unlike reactive state they are never read, held and committed later,
 * so there is no stale-writer case for layer 3 to catch.
 *
 * Lock ordering is record-then-state, always. Record writers call `updateState`
 * to project themselves into the index while holding their record lock; nothing
 * acquires a record lock from inside a state updater.
 */

export class StaleStateError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(`State changed under this writer (expected revision ${expectedRevision}, found ${actualRevision})`);
    this.name = 'StaleStateError';
  }
}

const queues = new Map<string, Promise<unknown>>();

/** Serialise work on one file within this process. */
function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  // The queue must survive a rejected entry, so the chain swallows the error
  // and only the returned promise carries it to the caller.
  const next = previous.then(fn, fn);
  queues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

async function readRaw(stateFile: string): Promise<DesignLibraryState | null> {
  const raw = await readFile(stateFile, 'utf8').catch(() => null);
  if (raw === null) return null;
  return normalizeState(JSON.parse(raw) as unknown);
}

export async function readUnnormalizedState(paths: DesignLibraryPaths): Promise<unknown> {
  const raw = await readFile(paths.stateFile, 'utf8').catch(() => null);
  return raw === null ? null : JSON.parse(raw) as unknown;
}

/**
 * A temp path no concurrent write can collide with. The pid alone is not
 * enough — two writes to one file from the same process would share it — and
 * neither is a timestamp, which repeats within a millisecond.
 */
let tempSequence = 0;
function tempPathFor(filePath: string): string {
  tempSequence += 1;
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${tempSequence}.tmp`);
}

async function writeAtomic(stateFile: string, state: DesignLibraryState): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temp = tempPathFor(stateFile);
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await rename(temp, stateFile);
}

export type StateReadResult = DesignLibraryState & EntityIndexes & {
  galleryFamilies: EntityIndexes['gallery'];
};

async function readIndexForTests<T>(filePath: string, normalize: (value: unknown) => T[]): Promise<T[]> {
  const raw = await readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) return [];
  try {
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export async function readState(paths: DesignLibraryPaths): Promise<DesignLibraryState> {
  return (await readRaw(paths.stateFile)) ?? structuredClone(DEFAULT_STATE);
}

/** Test inspection helper. Product code reads each entity index directly. */
export async function readStateWithIndexes(paths: DesignLibraryPaths): Promise<StateReadResult> {
  const [state, items, designs, gallery, jobs, exports] = await Promise.all([
    readState(paths),
    readIndexForTests(paths.itemsIndexFile, normalizeItemIndex),
    readIndexForTests(paths.designsIndexFile, normalizeDesignIndex),
    readIndexForTests(paths.galleryIndexFile, normalizeGalleryIndex),
    readIndexForTests(paths.jobsIndexFile, normalizeJobIndex),
    readIndexForTests(paths.exportsIndexFile, normalizeExportIndex),
  ]);
  Object.defineProperties(state, {
    items: { value: items, enumerable: false },
    designs: { value: designs, enumerable: false },
    gallery: { value: gallery, enumerable: false },
    galleryFamilies: { value: gallery, enumerable: false },
    jobs: { value: jobs, enumerable: false },
    exports: { value: exports, enumerable: false },
  });
  return state as StateReadResult;
}

/**
 * Read, transform and write under both locks. The updater sees state read
 * inside the lock, so it can never be working from a stale copy. Returning
 * `null` from the updater abandons the write without touching the file.
 */
export async function updateState<T = void>(
  paths: DesignLibraryPaths,
  updater: (current: DesignLibraryState) => DesignLibraryState | null | Promise<DesignLibraryState | null>,
  options: { result?: (state: DesignLibraryState) => T; lock?: FileLockOptions } = {},
): Promise<T | undefined> {
  return enqueue(paths.stateFile, () =>
    withLock(
      paths.lockDir,
      async () => {
        const current = await readState(paths);
        const next = await updater(current);
        if (next === null) return undefined;
        const committed: DesignLibraryState = { ...next, revision: current.revision + 1 };
        await writeAtomic(paths.stateFile, committed);
        return options.result ? options.result(committed) : undefined;
      },
      options.lock,
    ),
  ) as Promise<T | undefined>;
}

/**
 * Commit a state object prepared outside the lock. Rejects when the on-disk
 * revision has moved on, which is the case `updateState` cannot help with —
 * a caller that read state, went away to do slow work, and came back.
 */
export async function commitState(
  paths: DesignLibraryPaths,
  next: DesignLibraryState,
  expectedRevision: number,
  options: { lock?: FileLockOptions } = {},
): Promise<DesignLibraryState> {
  return enqueue(paths.stateFile, () =>
    withLock(
      paths.lockDir,
      async () => {
        const current = await readState(paths);
        if (current.revision !== expectedRevision) {
          throw new StaleStateError(expectedRevision, current.revision);
        }
        const committed: DesignLibraryState = { ...next, revision: current.revision + 1 };
        await writeAtomic(paths.stateFile, committed);
        return committed;
      },
      options.lock,
    ),
  );
}

/** Replace legacy control state once migration has made every entity file durable. */
export async function commitMigratedState(
  paths: DesignLibraryPaths,
  migrate: (legacy: unknown) => DesignLibraryState,
): Promise<DesignLibraryState> {
  return enqueue(paths.stateFile, () =>
    withLock(paths.lockDir, async () => {
      const raw = await readUnnormalizedState(paths);
      const committed = migrate(raw);
      await writeAtomic(paths.stateFile, committed);
      return committed;
    }),
  );
}

/**
 * Append one intent for the runtime to apply. Extension tools call this
 * instead of writing records themselves.
 */
export async function appendRequest(
  paths: DesignLibraryPaths,
  body: LibraryRequestBody,
): Promise<number> {
  const id = await updateState<number>(
    paths,
    (current) => ({
      ...current,
      nextRequestId: current.nextRequestId + 1,
      requests: [...current.requests, { id: current.nextRequestId, requestedAt: Date.now(), body }],
    }),
    { result: (state) => state.nextRequestId - 1 },
  );
  if (id === undefined) throw new Error('Failed to append request');
  return id;
}

/** Requests the runtime has not applied yet, oldest first. */
export function pendingRequests(state: DesignLibraryState): DesignLibraryState['requests'] {
  return state.requests
    .filter((request) => request.id > state.consumedRequestId)
    .sort((a, b) => a.id - b.id);
}

/**
 * Atomic JSON record helpers, used for item and job files.
 *
 * A record that is missing or unparseable resolves to null rather than
 * throwing. Records are per-item and individually skippable, so one truncated
 * file should cost one item — not the whole runtime. Reactive state is
 * deliberately not this forgiving: it holds collections and settings that
 * cannot be rebuilt, so a corrupt state file fails loudly instead of quietly
 * resetting to defaults.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const raw = await readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = tempPathFor(filePath);
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, filePath);
}

/**
 * The lock guarding one record file, held in a directory of its own rather than
 * beside the record.
 *
 * Permanent deletion removes an item's whole directory. A lock stored inside it
 * would be deleted while still held, which is worse than leaking one: another
 * process could immediately acquire the "free" lock and start writing, and this
 * process would then delete *that* lock when it released. Keeping locks apart
 * from the data they guard means a transaction owns its mutex for its whole
 * life, however the data is disposed of.
 *
 * The name is derived from the record's path within the home directory, so two
 * records never collide and the mapping needs no bookkeeping.
 */
export function recordLockDir(paths: DesignLibraryPaths, filePath: string): string {
  const relative = path.relative(paths.home, filePath);
  const key = relative.replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(paths.recordLocksDir, `${key}.lock`);
}

/**
 * Serialise a whole read-transform-write on one record file.
 *
 * The atomic rename in `writeJsonFile` makes a single write safe; it does
 * nothing for two writers that each read the same record and then write back
 * what they computed. The later write simply wins, and whatever the earlier one
 * changed — a favourite, a field override, a `deletedAt` — is gone with no
 * error anywhere. That is reachable in ordinary use: an analysis result lands
 * through the queue while the coordinator applies a user request for the same
 * item.
 *
 * Not reentrant. Callers holding the lock must use the unlocked write helpers.
 */
export async function withRecordLock<T>(
  paths: DesignLibraryPaths,
  filePath: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  return enqueue(filePath, () => withLock(recordLockDir(paths, filePath), fn, options));
}
