import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { tombstoneFile } from '../shared/paths';
import { appendRequest, readStateWithIndexes, updateState } from '../shared/state-io';
import type { AppRuntimeSubagentRunParams } from '@sero-ai/common';

import { ANALYSIS_REPLY, FAST_POLL, useCoordinator, viewReference } from './coordinator-harness';
import { markSucceeded } from './jobs';
import { listJobs, mutateItem, readItem } from './store';

const harness = useCoordinator('coordinator');

describe('applying requests', () => {
  it('imports and analyses automatically', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    const item = await readItem(harness.paths, itemId);
    expect(item?.profile.generated.primaryStyle).toBe('Technical monochrome');
    expect(item?.profile.generated.provenance.modelId).toBe('stub-model');

    // Analysis gets no platform tools at all — only the reference viewer.
    expect(harness.runStructured.mock.calls[0][0].platformTools).toBe('none');
  });

  it('does not navigate into a newly imported reference', async () => {
    // Opening is a full-surface navigation, so a bulk import must leave the
    // user in the grid rather than jumping to the last file.
    await harness.importAndAnalyse('u1', 'a.png', 'first');
    await harness.importAndAnalyse('u2', 'b.png', 'second');

    expect((await readStateWithIndexes(harness.paths)).view.selectedItemId).toBeUndefined();
  });

  it('opens the existing item when a duplicate is imported', async () => {
    const first = await harness.importAndAnalyse('u1', 'a.png', 'identical');

    await harness.upload('u2', 'b.png', 'identical');
    await appendRequest(harness.paths, { kind: 'ingest', uploadId: 'u2' });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.items).toHaveLength(1);
    expect(state.view.selectedItemId).toBe(first);
  });

  it('keeps a manual field through reanalysis and restores it on reset', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(harness.paths, {
      kind: 'item.set-field',
      itemId,
      field: 'primaryStyle',
      value: 'My own style',
    });
    await harness.coordinator.drain();

    await appendRequest(harness.paths, { kind: 'analysis.run', itemId, force: true });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.attempts).toBe(2);
    }, FAST_POLL);

    const summary = (await readStateWithIndexes(harness.paths)).items.find((entry) => entry.id === itemId);
    expect(summary?.primaryStyle).toBe('My own style');
    expect(summary?.edited).toBe(true);

    await appendRequest(harness.paths, { kind: 'item.reset-field', itemId, field: 'primaryStyle' });
    await harness.coordinator.drain();

    const afterReset = (await readStateWithIndexes(harness.paths)).items.find((entry) => entry.id === itemId);
    expect(afterReset?.primaryStyle).toBe('Technical monochrome');
    expect(afterReset?.edited).toBe(false);
  });

  it('advances the watermark and drops applied requests', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, { kind: 'item.favourite', itemId, favourite: true });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.requests).toEqual([]);
    expect(state.consumedRequestId).toBeGreaterThan(0);
    expect(state.items[0].favourite).toBe(true);
  });

  it('does not apply a request twice', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, { kind: 'item.favourite', itemId, favourite: true });
    await harness.coordinator.drain();
    await harness.coordinator.drain();

    // A second drain over a consumed log must not re-run the analysis either.
    expect(harness.runStructured).toHaveBeenCalledTimes(1);
  });
});

describe('deletion', () => {
  it('hides an item until it is restored, without touching its files', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(harness.paths, { kind: 'item.delete', itemId });
    await harness.coordinator.drain();
    expect((await readItem(harness.paths, itemId))?.deletedAt).toBeGreaterThan(0);

    await appendRequest(harness.paths, { kind: 'item.restore', itemId });
    await harness.coordinator.drain();
    expect((await readItem(harness.paths, itemId))?.deletedAt).toBeUndefined();
  });

  it('leaves a tombstone when an item is permanently deleted', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(harness.paths, { kind: 'item.purge', itemId });
    await harness.coordinator.drain();

    expect(await readItem(harness.paths, itemId)).toBeNull();
    expect((await readStateWithIndexes(harness.paths)).items).toEqual([]);

    const tombstone = JSON.parse(await readFile(tombstoneFile(harness.paths, itemId), 'utf8')) as {
      itemId: string;
      title: string;
    };
    expect(tombstone.itemId).toBe(itemId);
    expect(tombstone.title).toBe('Analysed title');
  });
});

describe('collections', () => {
  it('deleting a collection drops the grouping but keeps its references', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(harness.paths, { kind: 'collection.create', collectionId: 'c1', name: 'Dashboards', colour: 'primary' });
    await appendRequest(harness.paths, { kind: 'item.collect', itemId, collectionId: 'c1', member: true });
    await harness.coordinator.drain();
    expect((await readStateWithIndexes(harness.paths)).items[0].collectionIds).toEqual(['c1']);

    await appendRequest(harness.paths, { kind: 'collection.delete', collectionId: 'c1' });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.collections).toEqual([]);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].collectionIds).toEqual([]);
  });
});

describe('shutdown', () => {
  it('waits for in-flight analysis before dispose resolves', async () => {
    // The regression: dispose aborted the run and returned immediately, so a
    // write landed after teardown — which is what made CI fail with ENOTEMPTY
    // when the temp directory was removed straight afterwards.
    let releaseRun: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      harness.runStructured.mockImplementationOnce(async (params: AppRuntimeSubagentRunParams) => {
        await viewReference(params);
        resolve();
        await new Promise<void>((release) => {
          releaseRun = release;
        });
        return { response: ANALYSIS_REPLY, modelId: 'stub-model', providerId: 'stub' };
      });
    });

    await harness.upload('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, { kind: 'ingest', uploadId: 'u1' });
    await harness.coordinator.drain();
    await started;

    let disposed = false;
    const disposal = harness.coordinator.dispose().then(() => {
      disposed = true;
    });

    // Give dispose every chance to resolve early while the run is still open.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(disposed).toBe(false);

    releaseRun();
    await disposal;
    expect(disposed).toBe(true);
  });
});

describe('reanalysis', () => {
  it('runs one job at a time even when forced during a run', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    expect(harness.runStructured).toHaveBeenCalledTimes(1);

    // Two forced reanalyses back to back: the first must be cancelled and
    // waited for, not left racing the second.
    await appendRequest(harness.paths, { kind: 'analysis.run', itemId, force: true });
    await appendRequest(harness.paths, { kind: 'analysis.run', itemId, force: true });
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.status).toBe('ready');
    }, FAST_POLL);

    const item = await readItem(harness.paths, itemId);
    const jobs = await listJobs(harness.paths);
    const running = jobs.filter((job) => job.status === 'running');

    expect(running).toEqual([]);
    // Exactly one job owns the item, and it is the one that finished.
    expect(jobs.filter((job) => job.id === item?.analysis.jobId)[0]?.status).toBe('succeeded');
  });

  it('ignores a completion from a job the item has moved on from', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    const first = (await readItem(harness.paths, itemId))?.analysis.jobId;
    expect(first).toBeTruthy();

    // Point the item at a different job, as a forced reanalysis would.
    await mutateItem(harness.paths, itemId, (item) => ({
      ...item,
      analysis: { ...item.analysis, jobId: 'some-newer-job', status: 'running' },
    }));

    // The stale job reports success. It must not overwrite the newer state.
    await markSucceeded(harness.paths, first!);
    const after = await readItem(harness.paths, itemId);
    expect(after?.analysis.jobId).toBe('some-newer-job');
    expect(after?.analysis.status).toBe('running');
  });
});

describe('request consumption', () => {
  it('advances the watermark after each request, not after the batch', async () => {
    // A batch-wide watermark replayed everything already applied when the
    // process died part-way through.
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, { kind: 'item.favourite', itemId, favourite: true });
    await appendRequest(harness.paths, { kind: 'collection.create', collectionId: 'c1', name: 'One', colour: 'primary' });
    await appendRequest(harness.paths, { kind: 'collection.create', collectionId: 'c2', name: 'Two', colour: 'primary' });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.requests).toEqual([]);
    expect(state.consumedRequestId).toBe(state.nextRequestId - 1);
  });

  it('is safe to replay a request that was applied but not recorded', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    // Simulate the crash window: apply, then put the request back unconsumed.
    await appendRequest(harness.paths, { kind: 'item.favourite', itemId, favourite: true });
    await harness.coordinator.drain();
    const applied = await readStateWithIndexes(harness.paths);
    expect(applied.items[0].favourite).toBe(true);

    await updateState(harness.paths, (current) => ({
      ...current,
      consumedRequestId: current.consumedRequestId - 1,
      requests: [
        { id: current.consumedRequestId, requestedAt: Date.now(), body: { kind: 'item.favourite', itemId, favourite: true } },
      ],
    }));
    await harness.coordinator.drain();

    const replayed = await readStateWithIndexes(harness.paths);
    expect(replayed.items[0].favourite).toBe(true);
    expect(replayed.requests).toEqual([]);
  });

  it('does not re-run analysis when an ingest request is replayed', async () => {
    await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    expect(harness.runStructured).toHaveBeenCalledTimes(1);

    // The upload was consumed by the first apply, so a replay finds nothing.
    await appendRequest(harness.paths, { kind: 'ingest', uploadId: 'u1' });
    await harness.coordinator.drain();

    expect(harness.runStructured).toHaveBeenCalledTimes(1);
    expect((await readStateWithIndexes(harness.paths)).items).toHaveLength(1);
  });

  it('retains an export request until its terminal state is durable', async () => {
    const failures: string[] = [];
    const apply = vi.fn()
      .mockRejectedValueOnce(new Error('export record lock timed out'))
      .mockResolvedValueOnce(undefined);
    const retrying = harness.withExportRequests({ apply }, failures);
    await appendRequest(harness.paths, {
      kind: 'export.run',
      exportId: 'exp-retry',
      familyId: 'fam-1',
      versionId: 'ver-1',
      destination: 'downloads',
    });

    try {
      await retrying.drain();
      const retained = await readStateWithIndexes(harness.paths);
      expect(retained.requests.map((request) => request.body.kind)).toEqual(['export.run']);
      expect(retained.consumedRequestId).toBe(0);

      await retrying.drain();
      const recovered = await readStateWithIndexes(harness.paths);
      expect(recovered.requests).toEqual([]);
      expect(recovered.consumedRequestId).toBe(1);
      expect(apply).toHaveBeenCalledTimes(2);
      expect(failures).toEqual(['Request 1 (export.run) failed']);
    } finally {
      await retrying.dispose();
    }
  });
});

describe('field validation', () => {
  it('refuses a malformed value even when it reaches the runtime directly', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    // The tool validates too; this is the request log being written directly.
    await appendRequest(harness.paths, {
      kind: 'item.set-field',
      itemId,
      field: 'tags',
      value: 99 as never,
    });
    await harness.coordinator.drain();

    const item = await readItem(harness.paths, itemId);
    expect(item?.profile.overrides.tags).toBeUndefined();
    // The bad request is consumed rather than stalling the queue.
    expect((await readStateWithIndexes(harness.paths)).requests).toEqual([]);
  });
});

describe('failure handling', () => {
  it('records a failed analysis without losing the item', async () => {
    harness.runStructured.mockResolvedValueOnce({ response: '', error: 'provider exploded' });

    await harness.upload('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, { kind: 'ingest', uploadId: 'u1' });
    await harness.coordinator.drain();

    const itemId = (await readStateWithIndexes(harness.paths)).items[0].id;
    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.status).toBe('failed');
    }, FAST_POLL);
    expect((await readItem(harness.paths, itemId))?.analysis.error).toBe('provider exploded');

    // The reason has to reach the grid, or the UI can only say "it failed".
    // Waited for rather than read once: the record is written before the index,
    // so a read taken the moment the record lands can precede the projection.
    await vi.waitFor(async () => {
      const summary = (await readStateWithIndexes(harness.paths)).items.find((entry) => entry.id === itemId);
      expect(summary?.analysisError).toBe('provider exploded');
    }, FAST_POLL);
  });

  it('restarts an analysis left running by a process that is gone', async () => {
    // Reconciliation repairs an item whose job it can still read, and finished
    // job records are swept after a day — so a machine left closed longer than
    // that comes back to an item nothing else would ever look at again.
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    await mutateItem(harness.paths, itemId, (item) => ({
      ...item,
      analysis: { ...item.analysis, status: 'running', jobId: 'job-that-was-swept' },
    }));

    await harness.coordinator.start();

    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.status).toBe('ready');
    }, FAST_POLL);
  });

  it('keeps draining after one request fails', async () => {
    // An ingest naming an upload that does not exist must not stall the queue.
    await appendRequest(harness.paths, { kind: 'ingest', uploadId: 'missing' });
    await appendRequest(harness.paths, {
      kind: 'collection.create',
      collectionId: 'c1',
      name: 'Still applied',
      colour: 'primary',
    });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.collections.map((entry) => entry.name)).toEqual(['Still applied']);
    expect(state.requests).toEqual([]);
  });
});
