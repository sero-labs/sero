import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { emptyAnalysis } from '../shared/librarian';
import { designLibraryPathsFromHome, itemDir, type DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord, JobRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { AnalysisQueue } from './analysis-queue';
import { createJob } from './jobs';
import { invokeTool } from './librarian/test-support';
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

/** A reply that satisfies the parser and the content limits. */
const ANALYSIS_REPLY = JSON.stringify({
  title: 'Analysed title',
  primaryStyle: 'Technical monochrome',
  designTypes: ['dashboard'],
  tags: ['a', 'b', 'c', 'd', 'e', 'f'],
  summary: 'A summary.',
  designIntent: 'An intent.',
  aestheticVocabulary: [{ term: 'exact' }],
  visualProfile: { colour: ['near-black'] },
  palette: [{ hex: '#0b0b0d', role: 'background' }],
  always: ['Keep geometry square'],
  never: ['Decorative gradients'],
  generationPrompt: Array.from({ length: 100 }, () => 'word').join(' '),
  confidence: 0.9,
});

function stubHost(): AppRuntimeHost {
  const blocked = new Promise<void>((resolve) => {
    releaseRuns = resolve;
  });
  return {
    subagents: {
      // Runs hold until released, which is what keeps the queue saturated so a
      // third job stays pending for the cancellation tests. Once released the
      // run behaves like a model that did its job: it views the image first,
      // because a reply produced without that is refused.
      runStructured: vi.fn(async (params: AppRuntimeSubagentRunParams) => {
        await blocked;
        const tools = (params.customTools ?? []) as ToolDefinition[];
        const viewer = tools.find((tool) => tool.name === 'design_library_view_reference');
        if (viewer) await invokeTool(viewer);
        return { response: ANALYSIS_REPLY, modelId: 'stub', providerId: 'stub' };
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
  // Real bytes on disk: the run refuses any analysis produced without the
  // model actually viewing the image, and the viewer reads this file.
  await mkdir(itemDir(paths, id), { recursive: true });
  await writeFile(path.join(itemDir(paths, id), 'original.png'), Buffer.from('image-bytes'));
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

describe('the order a finished job is recorded in', () => {
  it('never reports an item ready while its own job still says running', async () => {
    // The item is the thing the UI waits on, so anything that reads the item
    // and then looks up its job must not find a contradiction. Writing the item
    // first left exactly that window — wide enough to fail on a slow runner.
    const job = await queuedAnalysis('itm-order');
    queue.enqueue(job.id);
    releaseRuns();

    // Sampled as tightly as the event loop allows rather than through
    // `vi.waitFor`, whose polling interval steps straight over a window this
    // narrow and would report the bug as fixed while it was still there.
    let sawReady = false;
    let jobWhenReady = 'never-observed';
    for (let attempt = 0; attempt < 20_000 && !sawReady; attempt += 1) {
      const item = await readItem(paths, 'itm-order');
      if (item?.analysis.status === 'ready') {
        sawReady = true;
        jobWhenReady = (await readJob(paths, job.id))?.status ?? 'missing';
      }
    }

    expect(sawReady).toBe(true);
    expect(jobWhenReady).toBe('succeeded');
  });
});
