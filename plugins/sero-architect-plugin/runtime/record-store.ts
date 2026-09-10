/**
 * The record store: `<home>/projects/<id>.json` per project, plus the watched
 * index, which is the app's state file.
 *
 * Single writer: every mutation runs through one promise chain, so two wakes
 * cannot interleave a read-modify-write. Atomic: a record is written to a
 * temp file and renamed into place, so an interrupted write leaves the previous
 * complete record readable and never a partial one. The index is derived from
 * those records. An index failure does not make a durable mutation look safe
 * to retry; the next write or startup rebuild repairs it.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { normalizeIndex, type ArchitectIndex } from '../shared/types';
import { toIndexEntry, type ProjectRecord } from '../shared/record';

export interface RecordStoreIo {
  writeFile(filePath: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  unlink(filePath: string): Promise<void>;
  mkdir(dirPath: string): Promise<void>;
  readdir(dirPath: string): Promise<string[]>;
}

export interface RecordStoreDeps {
  homeDir: string;
  /** The app state file the host watches; the index lives there. */
  indexFile: string;
  updateIndex(updater: (current: ArchitectIndex | null) => ArchitectIndex): Promise<void>;
  io?: Partial<RecordStoreIo>;
}

const defaultIo: RecordStoreIo = {
  writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8'),
  rename: (from, to) => fs.rename(from, to),
  readFile: (filePath) => fs.readFile(filePath, 'utf8'),
  unlink: (filePath) => fs.unlink(filePath),
  mkdir: async (dirPath) => { await fs.mkdir(dirPath, { recursive: true }); },
  readdir: async (dirPath) => {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return [];
    }
  },
};

function isRecordShape(value: unknown): value is ProjectRecord {
  return typeof value === 'object' && value !== null
    && (value as ProjectRecord).version === 1
    && typeof (value as ProjectRecord).id === 'string'
    && typeof (value as ProjectRecord).phase === 'string';
}

/**
 * Turns one record into the next. It runs inside the write queue, so it must
 * not call back into the store, and any slow work belongs before the call.
 * Returning null leaves the record on disk untouched.
 */
export type RecordMutator = (record: ProjectRecord) => ProjectRecord | null | Promise<ProjectRecord | null>;

export interface RecordStore {
  readonly projectsDir: string;
  read(projectId: string): Promise<ProjectRecord | null>;
  list(): Promise<ProjectRecord[]>;
  /** Writes the record and its index row as one queued step. */
  write(record: ProjectRecord): Promise<void>;
  /**
   * Read, change and write as one queued step, so a concurrent write can never
   * be lost under a stale copy. Returns the record written, or null when the
   * project is gone or the mutator declined.
   */
  update(projectId: string, mutate: RecordMutator): Promise<ProjectRecord | null>;
  /** Removes the record file and its index row as one queued step. */
  remove(projectId: string): Promise<void>;
  /** Rewrites the index from the records on disk, for restart reconciliation. */
  rebuildIndex(): Promise<ArchitectIndex>;
}

/** What a validating mutator decided: the next record, or why it refused. */
export type RecordMutation = { record: ProjectRecord } | { error: string };

/**
 * Validates and changes a record inside the write queue, and reports the
 * refusal the caller must show. Use it wherever a check reads the record and a
 * write depends on what it read.
 */
export async function mutateRecord(
  store: RecordStore,
  projectId: string,
  mutate: (record: ProjectRecord) => RecordMutation | Promise<RecordMutation>,
): Promise<{ ok: true; record: ProjectRecord } | { ok: false; error: string }> {
  let error = `No project ${projectId}.`;
  const written = await store.update(projectId, async (record) => {
    const result = await mutate(record);
    if ('error' in result) {
      error = result.error;
      return null;
    }
    return result.record;
  });
  return written ? { ok: true, record: written } : { ok: false, error };
}

export function createRecordStore(deps: RecordStoreDeps): RecordStore {
  const io: RecordStoreIo = { ...defaultIo, ...deps.io };
  const projectsDir = path.join(deps.homeDir, 'projects');
  let queue: Promise<unknown> = Promise.resolve();
  let indexDirty = false;

  /** The single writer. Each step waits for the previous, whether it succeeded or not. */
  function enqueue<T>(step: () => Promise<T>): Promise<T> {
    const next = queue.then(step, step);
    queue = next.catch(() => undefined);
    return next;
  }

  const recordPath = (projectId: string) => path.join(projectsDir, `${projectId}.json`);

  async function readAt(filePath: string): Promise<ProjectRecord | null> {
    try {
      const parsed: unknown = JSON.parse(await io.readFile(filePath));
      return isRecordShape(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function writeAtomically(record: ProjectRecord): Promise<void> {
    await io.mkdir(projectsDir);
    const target = recordPath(record.id);
    const temp = `${target}.tmp.${process.pid}.${Date.now()}`;
    try {
      await io.writeFile(temp, JSON.stringify(record, null, 2));
      await io.rename(temp, target);
    } catch (error) {
      await io.unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  async function listRecords(): Promise<ProjectRecord[]> {
    const names = (await io.readdir(projectsDir)).filter((name) => name.endsWith('.json'));
    const records = await Promise.all(names.map((name) => readAt(path.join(projectsDir, name))));
    return records.filter((record): record is ProjectRecord => record !== null);
  }

  async function rebuildIndexUnlocked(): Promise<ArchitectIndex> {
    const rebuilt: ArchitectIndex = { version: 1, projects: (await listRecords()).map(toIndexEntry) };
    await deps.updateIndex(() => rebuilt);
    indexDirty = false;
    return rebuilt;
  }

  /** A durable record is authoritative. Index failure cannot make its mutation look retryable. */
  async function updateIndexEntry(record: ProjectRecord): Promise<void> {
    try {
      const entry = toIndexEntry(record);
      await deps.updateIndex((current) => {
        const index = normalizeIndex(current);
        const projects = index.projects.some((p) => p.id === entry.id)
          ? index.projects.map((p) => (p.id === entry.id ? entry : p))
          : [...index.projects, entry];
        return { version: 1, projects };
      });
      indexDirty = false;
    } catch {
      indexDirty = true;
    }
  }

  /** Writes the authoritative record, then updates the derived index best-effort. */
  async function commit(record: ProjectRecord): Promise<void> {
    await writeAtomically(record);
    if (indexDirty) {
      try {
        await rebuildIndexUnlocked();
      } catch {
        indexDirty = true;
      }
      return;
    }
    await updateIndexEntry(record);
  }

  return {
    projectsDir,

    read(projectId) {
      return readAt(recordPath(projectId));
    },

    list: listRecords,

    write(record) {
      return enqueue(() => commit(record));
    },

    update(projectId, mutate) {
      return enqueue(async () => {
        const current = await readAt(recordPath(projectId));
        if (!current) return null;
        const next = await mutate(current);
        if (!next) return null;
        await commit(next);
        return next;
      });
    },

    remove(projectId) {
      return enqueue(async () => {
        await io.unlink(recordPath(projectId)).catch(() => undefined);
        if (indexDirty) {
          try {
            await rebuildIndexUnlocked();
          } catch {
            indexDirty = true;
          }
          return;
        }
        try {
          await deps.updateIndex((current) => {
            const index = normalizeIndex(current);
            return { version: 1, projects: index.projects.filter((p) => p.id !== projectId) };
          });
          indexDirty = false;
        } catch {
          indexDirty = true;
        }
      });
    },

    rebuildIndex() {
      return enqueue(rebuildIndexUnlocked);
    },
  };
}
