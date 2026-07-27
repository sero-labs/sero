import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DesignLibraryPaths } from '../shared/paths';
import { itemDir, itemRecordFile, jobFile } from '../shared/paths';
import type { ItemRecord, JobRecord } from '../shared/records';
import { normalizeItemRecord, normalizeJobRecord } from '../shared/records';
import { readJsonFile, updateState, withRecordLock, writeJsonFile } from '../shared/state-io';
import type { DesignLibraryState } from '../shared/types';
import { projectItem, projectJob } from './projection';

/**
 * Record storage and the index that mirrors it.
 *
 * Only the runtime uses this module — it is the single authoritative writer
 * (spec §12). Every record write is followed by a projection of that record
 * into reactive state, so the two never drift for longer than one await.
 */

/** Jobs older than this that are already finished are pruned from the index. */
const FINISHED_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Every record read goes through validation. A file written by an earlier
 * version of the plugin, or left half-written by a crash, resolves to null
 * instead of handing back an object whose shape nobody has checked.
 */
export async function readItem(paths: DesignLibraryPaths, itemId: string): Promise<ItemRecord | null> {
  return normalizeItemRecord(await readJsonFile<unknown>(itemRecordFile(paths, itemId)));
}

export async function listItemIds(paths: DesignLibraryPaths): Promise<string[]> {
  const entries = await readdir(paths.itemsDir, { withFileTypes: true }).catch(() => []);
  return entries.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));
}

export interface ItemScan {
  items: ItemRecord[];
  /** Directories holding a record this version cannot read. Files are left alone. */
  unreadable: string[];
}

/**
 * Read every record, separating the ones this version understands from the
 * ones it does not. Unreadable records are reported, never deleted — they are
 * excluded from the index so the app works, and their files stay on disk so
 * nothing is destroyed by a version that simply moved on.
 */
export async function scanItems(paths: DesignLibraryPaths): Promise<ItemScan> {
  const ids = await listItemIds(paths);
  const items: ItemRecord[] = [];
  const unreadable: string[] = [];

  for (const id of ids) {
    const record = await readItem(paths, id);
    if (record) items.push(record);
    else unreadable.push(id);
  }
  return { items, unreadable };
}

export async function readAllItems(paths: DesignLibraryPaths): Promise<ItemRecord[]> {
  return (await scanItems(paths)).items;
}

export function previewPathFor(item: ItemRecord): string {
  return `items/${item.id}/${item.asset.previewFile}`;
}

export function originalPathFor(item: ItemRecord): string {
  return `items/${item.id}/${item.asset.originalFile}`;
}

/**
 * Write a record and project it into the index. Assumes the caller holds the
 * record lock — `saveItem` and `mutateItem` are the entry points that take it.
 */
async function writeItem(paths: DesignLibraryPaths, item: ItemRecord): Promise<ItemRecord> {
  const next: ItemRecord = { ...item, updatedAt: Date.now() };
  await writeJsonFile(itemRecordFile(paths, next.id), next);
  const summary = projectItem(next, previewPathFor(next));
  await updateState(paths, (current) => ({
    ...current,
    items: [...current.items.filter((entry) => entry.id !== next.id), summary],
  }));
  return next;
}

/** Write a record and project it into the index in one step. */
export async function saveItem(paths: DesignLibraryPaths, item: ItemRecord): Promise<void> {
  await withRecordLock(itemRecordFile(paths, item.id), async () => {
    await writeItem(paths, item);
  });
}

/**
 * Read, transform and save one record. Returns null when the record is gone,
 * so callers can treat a request for a deleted item as a no-op rather than an
 * error — requests are applied asynchronously and the world may have moved on.
 *
 * The read and the write happen under one lock. Without that, an analysis
 * result and a user edit landing together would each read the same record and
 * the later writer would silently drop the other's change.
 */
export async function mutateItem(
  paths: DesignLibraryPaths,
  itemId: string,
  mutate: (item: ItemRecord) => ItemRecord | null,
): Promise<ItemRecord | null> {
  return withRecordLock(itemRecordFile(paths, itemId), async () => {
    const current = await readItem(paths, itemId);
    if (!current) return null;
    const next = mutate(current);
    if (!next) return null;
    return writeItem(paths, next);
  });
}

/**
 * Permanent deletion: the record, the original and the preview all go. Taken
 * under the record lock so a concurrent mutation cannot write the record back
 * out after the directory has been removed.
 */
export async function destroyItem(paths: DesignLibraryPaths, itemId: string): Promise<void> {
  await withRecordLock(itemRecordFile(paths, itemId), async () => {
    await rm(itemDir(paths, itemId), { recursive: true, force: true });
    await updateState(paths, (current) => ({
      ...current,
      items: current.items.filter((entry) => entry.id !== itemId),
    }));
  });
}

export async function readJob(paths: DesignLibraryPaths, jobId: string): Promise<JobRecord | null> {
  return normalizeJobRecord(await readJsonFile<unknown>(jobFile(paths, jobId)));
}

export async function listJobs(paths: DesignLibraryPaths): Promise<JobRecord[]> {
  const entries = await readdir(paths.jobsDir).catch(() => []);
  const jobs = await Promise.all(
    entries.flatMap((entry) =>
      entry.endsWith('.json')
        ? [readJsonFile<unknown>(path.join(paths.jobsDir, entry)).then(normalizeJobRecord)]
        : [],
    ),
  );
  return jobs.filter((job): job is JobRecord => job !== null);
}

/** Assumes the caller holds the job's record lock. */
async function writeJob(paths: DesignLibraryPaths, job: JobRecord): Promise<JobRecord> {
  await writeJsonFile(jobFile(paths, job.id), job);
  const summary = projectJob(job);
  await updateState(paths, (current) => ({
    ...current,
    jobs: [...current.jobs.filter((entry) => entry.id !== job.id), summary],
  }));
  return job;
}

export async function saveJob(paths: DesignLibraryPaths, job: JobRecord): Promise<void> {
  await withRecordLock(jobFile(paths, job.id), async () => {
    await writeJob(paths, job);
  });
}

/** Read and write under one lock, for the same reason as `mutateItem`. */
export async function mutateJob(
  paths: DesignLibraryPaths,
  jobId: string,
  mutate: (job: JobRecord) => JobRecord,
): Promise<JobRecord | null> {
  return withRecordLock(jobFile(paths, jobId), async () => {
    const current = await readJob(paths, jobId);
    if (!current) return null;
    return writeJob(paths, mutate(current));
  });
}

/**
 * Rebuild the whole index from the records. Called at startup, which is what
 * makes an index write interrupted by a crash self-healing rather than fatal.
 */
export async function reindex(paths: DesignLibraryPaths): Promise<ItemScan['unreadable']> {
  const [{ items, unreadable }, jobs] = await Promise.all([scanItems(paths), listJobs(paths)]);
  const cutoff = Date.now() - FINISHED_JOB_RETENTION_MS;
  const isLive = (job: JobRecord) =>
    job.status === 'queued' || job.status === 'running' || (job.completedAt ?? job.createdAt) > cutoff;
  const liveJobs = jobs.filter(isLive);

  // Partitioning by the predicate rather than by membership of the kept list:
  // `liveJobs.includes(job)` re-scanned the whole array for every job.
  await Promise.all(
    jobs.flatMap((job) => (isLive(job) ? [] : [rm(jobFile(paths, job.id), { force: true })])),
  );

  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    items: items.map((item) => projectItem(item, previewPathFor(item))),
    jobs: liveJobs.map(projectJob),
  }));

  return unreadable;
}

/** An item is a duplicate when another live record shares its checksum. */
export function findByChecksum(items: ItemRecord[], checksum: string): ItemRecord | null {
  return items.find((item) => item.asset.checksum === checksum && item.deletedAt === undefined) ?? null;
}
