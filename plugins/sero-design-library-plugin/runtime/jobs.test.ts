import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { readState } from '../shared/state-io';
import { createJob, markFailed, markRunning, markSucceeded, reconcileJobs } from './jobs';
import { mutateItem, readItem, reindex, saveItem } from './store';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-jobs-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function seedItem(id: string, status: ItemRecord['analysis']['status'] = 'pending'): Promise<ItemRecord> {
  const now = Date.now();
  const item: ItemRecord = {
    id,
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: 'image',
    source: { kind: 'file', fileName: `${id}.png` },
    asset: {
      originalFile: 'original.png',
      previewFile: 'preview.webp',
      mediaType: 'image/png',
      bytes: 10,
      checksum: `checksum-${id}`,
    },
    profile: { generated: emptyAnalysis(id), overrides: {} },
    analysis: { status, attempts: 0 },
    favourite: false,
    collectionIds: [],
  };
  await saveItem(paths, item);
  return item;
}

describe('restart recovery', () => {
  it('requeues a job whose process died mid-run', async () => {
    await seedItem('item-1');
    const job = await createJob(paths, 'analysis', 'item-1');
    await markRunning(paths, job.id);

    // The process dies here. On the next start, reconcile runs.
    const resumable = await reconcileJobs(paths);

    expect(resumable.map((entry) => entry.id)).toContain(job.id);
    const state = await readState(paths);
    expect(state.jobs.find((entry) => entry.id === job.id)?.status).toBe('queued');
  });

  it('puts the item back to pending so the UI does not show a spinner for nobody', async () => {
    await seedItem('item-1', 'running');
    const job = await createJob(paths, 'analysis', 'item-1');
    await markRunning(paths, job.id);

    await reconcileJobs(paths);

    expect((await readItem(paths, 'item-1'))?.analysis.status).toBe('pending');
  });

  it('leaves finished jobs alone', async () => {
    await seedItem('item-1');
    await seedItem('item-2');
    const succeeded = await createJob(paths, 'analysis', 'item-1');
    const failed = await createJob(paths, 'analysis', 'item-2');
    await markSucceeded(paths, succeeded.id);
    await markFailed(paths, failed.id, 'provider error');

    const resumable = await reconcileJobs(paths);
    expect(resumable).toEqual([]);
  });

  it('resumes a job that was still queued when the process stopped', async () => {
    await seedItem('item-1');
    const job = await createJob(paths, 'analysis', 'item-1');

    const resumable = await reconcileJobs(paths);
    expect(resumable.map((entry) => entry.id)).toEqual([job.id]);
  });
});

describe('reindex', () => {
  it('rebuilds the index from the records after an interrupted index write', async () => {
    await seedItem('item-1');
    await seedItem('item-2');

    // Simulate an index write that never landed: the records are on disk but
    // reactive state has lost them.
    const { updateState } = await import('../shared/state-io');
    await updateState(paths, (current) => ({ ...current, items: [] }));
    expect((await readState(paths)).items).toHaveLength(0);

    await reindex(paths);
    expect((await readState(paths)).items.map((item) => item.id).sort()).toEqual(['item-1', 'item-2']);
  });

  it('projects the effective title, so an override shows in the grid', async () => {
    const item = await seedItem('item-1');
    await saveItem(paths, {
      ...item,
      profile: {
        generated: item.profile.generated,
        overrides: { title: { field: 'title', value: 'My own title', updatedAt: Date.now() } },
      },
    });

    await reindex(paths);
    const summary = (await readState(paths)).items.find((entry) => entry.id === 'item-1');
    expect(summary?.title).toBe('My own title');
    expect(summary?.edited).toBe(true);
  });
});

describe('an item orphaned by a finished job', () => {
  it('is re-queued with a fresh job after a crash between the two writes', async () => {
    // A job and its item are separate files. A crash between marking the job
    // done and writing the item leaves the item claiming to run a job that
    // finished — and nothing else ever looks at it again.
    const item = await seedItem('itm-orphan', 'running');
    const job = await createJob(paths, 'analysis', item.id);
    await markRunning(paths, job.id);
    await mutateItem(paths, item.id, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'running', jobId: job.id },
    }));
    await markSucceeded(paths, job.id);

    const resumable = await reconcileJobs(paths);

    const repaired = await readItem(paths, item.id);
    expect(repaired?.analysis.status).toBe('pending');
    // Pending with no job owning it is the stuck spinner, so a replacement
    // must exist and be handed back for the queue to run.
    expect(repaired?.analysis.jobId).toBeDefined();
    expect(repaired?.analysis.jobId).not.toBe(job.id);
    expect(resumable.map((entry) => entry.id)).toContain(repaired?.analysis.jobId);
  });

  it('leaves an item alone when its own job is the one that finished cleanly', async () => {
    const item = await seedItem('itm-clean', 'ready');
    const job = await createJob(paths, 'analysis', item.id);
    await mutateItem(paths, item.id, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'ready', jobId: job.id },
    }));
    await markSucceeded(paths, job.id);

    await reconcileJobs(paths);

    const after = await readItem(paths, item.id);
    expect(after?.analysis.status).toBe('ready');
    expect(after?.analysis.jobId).toBe(job.id);
  });

  it('ignores a finished job the item has already moved on from', async () => {
    const item = await seedItem('itm-moved', 'running');
    const stale = await createJob(paths, 'analysis', item.id);
    const current = await createJob(paths, 'analysis', item.id);
    await mutateItem(paths, item.id, (entry) => ({
      ...entry,
      analysis: { ...entry.analysis, status: 'running', jobId: current.id },
    }));
    await markSucceeded(paths, stale.id);

    await reconcileJobs(paths);

    // The item points at `current`, so the older job's completion is none of
    // its business and must not trigger a re-run.
    expect((await readItem(paths, item.id))?.analysis.jobId).toBe(current.id);
  });
});
