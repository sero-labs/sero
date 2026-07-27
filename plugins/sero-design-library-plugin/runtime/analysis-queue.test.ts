import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntimeHost } from '@sero-ai/common';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord, JobRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { AnalysisQueue } from './analysis-queue';
import { createJob } from './jobs';
import { mutateItem, readItem, readJob, saveItem } from './store';

/**
 * Cancelling analysis that has not started.
 *
 * A running job reports its own cancellation when the abort reaches it. A job
 * still waiting its turn has no run to do that, so dropping it from the queue
 * without writing the outcome leaves the job `queued` and the item `pending` —
 * a spinner that never stops.
 */

let home: string;
let paths: DesignLibraryPaths;
let queue: AnalysisQueue;
/** Resolves every blocked run, so `dispose` is not left waiting on them. */
let releaseRuns: () => void;

function stubHost(): AppRuntimeHost {
  const blocked = new Promise<void>((resolve) => {
    releaseRuns = resolve;
  });
  return {
    subagents: {
      // Runs never finish on their own: that is what keeps the queue saturated
      // so a third job stays pending for the test to cancel.
      runStructured: vi.fn(async () => {
        await blocked;
        return { response: '{}', modelId: 'stub', providerId: 'stub' };
      }),
    },
  } as unknown as AppRuntimeHost;
}

function item(id: string): ItemRecord {
  const now = Date.now();
  return {
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
    analysis: { status: 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
  };
}

/** An item with a queued analysis job claiming it, as the coordinator leaves it. */
async function queuedAnalysis(id: string): Promise<JobRecord> {
  await saveItem(paths, item(id));
  const job = await createJob(paths, 'analysis', id);
  await mutateItem(paths, id, (current) => ({
    ...current,
    analysis: { ...current.analysis, status: 'pending', jobId: job.id },
  }));
  return job;
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-queue-'));
  paths = designLibraryPathsFromHome(home);
  queue = new AnalysisQueue({
    host: stubHost(),
    paths,
    workspaceId: 'ws',
    sessionId: 'session',
    onError: () => undefined,
  });
});

afterEach(async () => {
  releaseRuns();
  await queue.dispose();
  await rm(home, { recursive: true, force: true });
});

describe('cancelling a job that never started', () => {
  it('records the cancellation on both the job and the item', async () => {
    // Two runs saturate the queue (MAX_CONCURRENT is 2) and block there.
    const first = await queuedAnalysis('itm-busy-1');
    const second = await queuedAnalysis('itm-busy-2');
    queue.enqueue(first.id);
    queue.enqueue(second.id);
    await vi.waitFor(async () => {
      expect((await readJob(paths, first.id))?.status).toBe('running');
      expect((await readJob(paths, second.id))?.status).toBe('running');
    });

    const waiting = await queuedAnalysis('itm-waiting');
    queue.enqueue(waiting.id);

    await queue.cancel(waiting.id);

    expect((await readJob(paths, waiting.id))?.status).toBe('cancelled');
    expect((await readItem(paths, 'itm-waiting'))?.analysis.status).toBe('cancelled');
  });

  it('does not run the job afterwards, even once the queue frees up', async () => {
    const first = await queuedAnalysis('itm-busy-3');
    const second = await queuedAnalysis('itm-busy-4');
    queue.enqueue(first.id);
    queue.enqueue(second.id);
    await vi.waitFor(async () => {
      expect((await readJob(paths, second.id))?.status).toBe('running');
    });

    const waiting = await queuedAnalysis('itm-waiting-2');
    queue.enqueue(waiting.id);
    await queue.cancel(waiting.id);

    releaseRuns();
    await vi.waitFor(async () => {
      expect((await readJob(paths, first.id))?.status).not.toBe('running');
    });
    expect((await readJob(paths, waiting.id))?.status).toBe('cancelled');
  });

  it('is a no-op for a job that was never queued', async () => {
    await expect(queue.cancel('no-such-job')).resolves.toBeUndefined();
  });
});
