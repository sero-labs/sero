import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION, itemTarget, variantTarget } from '../shared/records';
import { readState } from '../shared/state-io';
import { mutateVariant, readDesign } from './design-store';
import {
  createJob,
  markCancelled,
  markFailed,
  markRunning,
  markSucceeded,
  reconcileJobs,
} from './jobs';
import { listJobs, mutateItem, readItem, reindex, saveItem } from './store';
import { seedDesign } from './test-fixtures';

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
    const job = await createJob(paths, 'analysis', itemTarget('item-1'));
    await markRunning(paths, job.id);

    // The process dies here. On the next start, reconcile runs.
    const resumable = await reconcileJobs(paths);

    expect(resumable.map((entry) => entry.id)).toContain(job.id);
    const state = await readState(paths);
    expect(state.jobs.find((entry) => entry.id === job.id)?.status).toBe('queued');
  });

  it('puts the item back to pending so the UI does not show a spinner for nobody', async () => {
    await seedItem('item-1', 'running');
    const job = await createJob(paths, 'analysis', itemTarget('item-1'));
    await markRunning(paths, job.id);

    await reconcileJobs(paths);

    expect((await readItem(paths, 'item-1'))?.analysis.status).toBe('pending');
  });

  it('leaves finished jobs alone', async () => {
    await seedItem('item-1');
    await seedItem('item-2');
    const succeeded = await createJob(paths, 'analysis', itemTarget('item-1'));
    const failed = await createJob(paths, 'analysis', itemTarget('item-2'));
    await markSucceeded(paths, succeeded.id);
    await markFailed(paths, failed.id, 'provider error');

    const resumable = await reconcileJobs(paths);
    expect(resumable).toEqual([]);
  });

  it('resumes a job that was still queued when the process stopped', async () => {
    await seedItem('item-1');
    const job = await createJob(paths, 'analysis', itemTarget('item-1'));

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
    const job = await createJob(paths, 'analysis', itemTarget(item.id));
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
    const job = await createJob(paths, 'analysis', itemTarget(item.id));
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
    const stale = await createJob(paths, 'analysis', itemTarget(item.id));
    const current = await createJob(paths, 'analysis', itemTarget(item.id));
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

describe('a variant orphaned or interrupted by its generation job', () => {
  async function claimFirstVariant(designId: string, jobId: string, status: 'running' | 'pending') {
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({ ...variant, status, jobId }));
    return variantId;
  }

  it('rewinds a running variant when its process died mid-run', async () => {
    const design = await seedDesign(paths, 'dsn-interrupted', { variantCount: 2 });
    const job = await createJob(paths, 'generate', variantTarget(design.id, design.variants[0]!.id));
    await markRunning(paths, job.id);
    const variantId = await claimFirstVariant(design.id, job.id, 'running');

    const resumable = await reconcileJobs(paths);

    const repaired = await readDesign(paths, design.id);
    expect(repaired?.variants.find((entry) => entry.id === variantId)?.status).toBe('pending');
    expect(resumable.map((entry) => entry.id)).toContain(job.id);
    // The sibling never had a job and must be left exactly as it was.
    expect(repaired?.variants[1]?.status).toBe('pending');
    expect(repaired?.variants[1]?.jobId).toBeUndefined();
  });

  it('replaces a finished job whose variant never heard about it', async () => {
    const design = await seedDesign(paths, 'dsn-orphan');
    const job = await createJob(paths, 'generate', variantTarget(design.id, design.variants[0]!.id));
    await markRunning(paths, job.id);
    const variantId = await claimFirstVariant(design.id, job.id, 'running');
    await markSucceeded(paths, job.id);

    const resumable = await reconcileJobs(paths);

    const repaired = await readDesign(paths, design.id);
    const variant = repaired?.variants.find((entry) => entry.id === variantId);
    expect(variant?.status).toBe('pending');
    expect(variant?.jobId).toBeDefined();
    expect(variant?.jobId).not.toBe(job.id);
    expect(resumable.map((entry) => entry.id)).toContain(variant?.jobId);
  });

  it('leaves a variant alone once it has moved past the finished job', async () => {
    const design = await seedDesign(paths, 'dsn-done');
    const job = await createJob(paths, 'generate', variantTarget(design.id, design.variants[0]!.id));
    const variantId = design.variants[0]!.id;
    await mutateVariant(paths, design.id, variantId, (variant) => ({
      ...variant,
      status: 'ready',
      jobId: job.id,
    }));
    await markSucceeded(paths, job.id);

    await reconcileJobs(paths);

    const after = await readDesign(paths, design.id);
    expect(after?.variants.find((entry) => entry.id === variantId)?.status).toBe('ready');
    expect(after?.variants.find((entry) => entry.id === variantId)?.jobId).toBe(job.id);
  });
});

describe('a target left behind by a job that finished without it', () => {
  it('re-queues an item still pending, not only one still running', async () => {
    // The crash window is between the job's terminal write and its target's, and
    // a cancel that never reached its target leaves it `pending`. Repairing only
    // `running` left this item spinning with no job that would ever revisit it.
    const item = await seedItem('itm-pending-orphan', 'pending');
    const job = await createJob(paths, 'analysis', itemTarget(item.id));
    await mutateItem(paths, item.id, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'pending', jobId: job.id },
    }));
    await markSucceeded(paths, job.id);

    const resumable = await reconcileJobs(paths);

    const repaired = await readItem(paths, item.id);
    expect(repaired?.analysis.jobId).not.toBe(job.id);
    expect(resumable.map((entry) => entry.id)).toContain(repaired?.analysis.jobId);
  });

  it('finishes a cancelled job’s target rather than running it again', async () => {
    const item = await seedItem('itm-cancelled-orphan', 'running');
    const job = await createJob(paths, 'analysis', itemTarget(item.id));
    await mutateItem(paths, item.id, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'running', jobId: job.id },
    }));
    await markCancelled(paths, job.id);

    const resumable = await reconcileJobs(paths);

    // Re-running would resurrect work the user had already stopped.
    const repaired = await readItem(paths, item.id);
    expect(repaired?.analysis.status).toBe('cancelled');
    expect(repaired?.analysis.jobId).toBe(job.id);
    expect(resumable).toEqual([]);
  });

  it('finishes a cancelled variant rather than starting it again', async () => {
    const design = await seedDesign(paths, 'dsn-cancel-orphan');
    const variantId = design.variants[0]!.id;
    const job = await createJob(paths, 'generate', variantTarget(design.id, variantId));
    await mutateVariant(paths, design.id, variantId, (variant) => ({
      ...variant,
      status: 'running',
      jobId: job.id,
    }));
    await markCancelled(paths, job.id);

    await reconcileJobs(paths);

    const repaired = await readDesign(paths, design.id);
    expect(repaired?.variants.find((entry) => entry.id === variantId)?.status).toBe('cancelled');
  });
});

describe('reconciliation racing a retry', () => {
  it('leaves a target alone once a newer job owns it', async () => {
    // The window: reconciliation reads the target, a retry installs a newer job,
    // and the stale terminal job then writes anyway. Checking inside the mutation
    // is what closes it; here the newer job is installed first, which is the same
    // state the race arrives at.
    const design = await seedDesign(paths, 'dsn-retry-race');
    const variantId = design.variants[0]!.id;
    const stale = await createJob(paths, 'generate', variantTarget(design.id, variantId));
    await mutateVariant(paths, design.id, variantId, (variant) => ({
      ...variant,
      status: 'pending',
      jobId: stale.id,
    }));
    await markSucceeded(paths, stale.id);

    const newer = await createJob(paths, 'generate', variantTarget(design.id, variantId));
    await mutateVariant(paths, design.id, variantId, (variant) => ({
      ...variant,
      status: 'pending',
      jobId: newer.id,
    }));

    const resumable = await reconcileJobs(paths);

    const repaired = await readDesign(paths, design.id);
    expect(repaired?.variants.find((entry) => entry.id === variantId)?.jobId).toBe(newer.id);
    // And no third job is left queued to run against a variant that has moved on.
    const generate = (await listJobs(paths)).filter(
      (job) => job.kind === 'generate' && job.status === 'queued',
    );
    expect(generate.map((job) => job.id)).toEqual([newer.id]);
    expect(resumable.map((job) => job.id)).toContain(newer.id);
  });
});
