import { stat } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { assetIsPending, currentAttempt } from '../shared/media';
import { designAssetDir } from '../shared/paths';
import { assetTarget } from '../shared/records';
import { appendRequest, readState } from '../shared/state-io';
import { useCoordinator } from './coordinator-harness';
import { readDesign } from './design-store';
import { createJob, markRunning, reconcileJobs } from './jobs';
import { reserveAsset } from './media/assets';
import { seedDesign } from './test-fixtures';

/**
 * What media does when things go wrong (item 9a).
 *
 * Every case here is one where the wrong behaviour costs money or leaves the
 * user stuck: a spinner nobody stops, a retry that re-runs a call that already
 * billed, files left behind by something that was cancelled. The provider is
 * the deterministic fake with faults injected, so all of it runs with no
 * network and no spend.
 */

async function assetOf(paths: Parameters<typeof readDesign>[0], designId: string, assetId: string) {
  const design = await readDesign(paths, designId);
  const asset = design?.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`no asset ${assetId}`);
  return asset;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

describe('a provider that fails', () => {
  const harness = useCoordinator('media-fault', {
    provider: { failWith: Object.assign(new Error('The provider is unavailable.'), {}) as never },
  });

  it('leaves a placeholder that can be retried, not a missing asset', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();

    const asset = await vi.waitFor(async () => {
      const found = await assetOf(harness.paths, 'design-1', 'asset-1');
      expect(found.attempts.length).toBeGreaterThan(0);
      return found;
    });

    // The asset exists, holds the failure, and owns no job — which is exactly
    // what the tray turns into a placeholder with a retry.
    expect(currentAttempt(asset)?.outcome).toBe('failed');
    expect(asset.jobId).toBeUndefined();
    // And the page can still point at it: the reference is fixed at
    // reservation and a failure does not move it.
    expect(asset.reference).toContain('asset-1');
  });

  it('fails the variant’s asset without failing the run', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      expect(state.jobs.find((job) => job.target.kind === 'asset')?.status).toBe('failed');
    });
    // The Design is untouched — a provider outage is not a reason to lose it.
    const design = await readDesign(harness.paths, 'design-1');
    expect(design?.variants.length).toBeGreaterThan(0);
  });
});

describe('a run that died holding an asset', () => {
  const harness = useCoordinator('media-recovery');

  it('comes back as a retryable placeholder rather than generating again', async () => {
    await seedDesign(harness.paths, 'design-1');
    const job = await createJob(harness.paths, 'media', assetTarget('design-1', 'asset-1'));
    const asset = await reserveAsset(
      harness.paths,
      'design-1',
      { capability: 'text-to-image', prompt: 'a wide hero' },
      { jobId: job.id },
      'asset-1',
    );
    expect(asset && assetIsPending(asset)).toBe(true);
    // Running, because that is what a job holding a provider call looks like —
    // a merely queued one is resumable and is meant to be picked up again.
    await markRunning(harness.paths, job.id);

    // The process dies here, mid-call. On the next start, reconciliation runs.
    await reconcileJobs(harness.paths);

    const recovered = await assetOf(harness.paths, 'design-1', 'asset-1');
    // Re-running would spend money the user did not ask to spend twice, which
    // is the one behaviour the spend rules exist to prevent. So it comes back
    // as a failure the user can choose to retry.
    expect(currentAttempt(recovered)?.outcome).toBe('failed');
    expect(currentAttempt(recovered)?.error?.retryable).toBe(true);
    expect(recovered.jobId).toBeUndefined();
  });

  it('leaves an asset that had already produced something alone', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      expect(currentAttempt(await assetOf(harness.paths, 'design-1', 'asset-1'))?.outcome).toBe(
        'ready',
      );
    });

    await reconcileJobs(harness.paths);

    // Recovery must not turn finished work into a failure.
    const asset = await assetOf(harness.paths, 'design-1', 'asset-1');
    expect(currentAttempt(asset)?.outcome).toBe('ready');
    expect(asset.attempts).toHaveLength(1);
  });
});

describe('purging an asset', () => {
  const harness = useCoordinator('media-purge');

  it('removes the record and every attempt’s files', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      expect(currentAttempt(await assetOf(harness.paths, 'design-1', 'asset-1'))?.outcome).toBe(
        'ready',
      );
    });
    const directory = designAssetDir(harness.paths, 'design-1', 'asset-1');
    expect(await exists(directory)).toBe(true);

    await appendRequest(harness.paths, {
      kind: 'media.purge',
      designId: 'design-1',
      assetId: 'asset-1',
    });
    await harness.coordinator.drain();

    const design = await readDesign(harness.paths, 'design-1');
    expect(design?.assets.find((entry) => entry.id === 'asset-1')).toBeUndefined();
    // Permanent means permanent: the bytes go with the record.
    expect(await exists(directory)).toBe(false);
  });

  it('is safe on an asset that is not there', async () => {
    await seedDesign(harness.paths, 'design-1');

    await appendRequest(harness.paths, {
      kind: 'media.purge',
      designId: 'design-1',
      assetId: 'never-existed',
    });

    // A request that names nothing must not stall the queue behind it.
    await expect(harness.coordinator.drain()).resolves.not.toThrow();
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-2',
      request: { capability: 'text-to-image', prompt: 'still working' },
    });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      expect((await assetOf(harness.paths, 'design-1', 'asset-2')).attempts.length).toBeGreaterThan(
        0,
      );
    });
  });
});

describe('retrying after a failure', () => {
  const harness = useCoordinator('media-retry-fault', { provider: { failFirst: 1 } });

  it('keeps the failure on the record and the reference on the page', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    const failed = await vi.waitFor(async () => {
      const found = await assetOf(harness.paths, 'design-1', 'asset-1');
      expect(found.attempts.length).toBeGreaterThan(0);
      return found;
    });
    expect(currentAttempt(failed)?.outcome).toBe('failed');
    const reference = failed.reference;

    await appendRequest(harness.paths, {
      kind: 'media.retry',
      designId: 'design-1',
      assetId: 'asset-1',
    });
    await harness.coordinator.drain();

    const retried = await vi.waitFor(async () => {
      const found = await assetOf(harness.paths, 'design-1', 'asset-1');
      expect(found.attempts).toHaveLength(2);
      return found;
    });
    // Attempts append, never replace: "preserves history" is only true if the
    // attempt that failed is still something you can look at.
    expect(retried.attempts[0]?.outcome).toBe('failed');
    expect(currentAttempt(retried)?.outcome).toBe('ready');
    // And the page already says `src="assets/asset-1.png"`.
    expect(retried.reference).toBe(reference);
  });
});

describe('two jobs racing for one asset', () => {
  const harness = useCoordinator('media-ownership');

  it('only the job the asset points at is allowed to spend', async () => {
    await seedDesign(harness.paths, 'design-1');
    // The crash window: `createJob` landed, `reserveAsset` did not, so this job
    // is queued and the asset never adopted it. The replayed request then
    // reserves the asset under a second job.
    const orphan = await createJob(harness.paths, 'media', assetTarget('design-1', 'asset-1'));
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      expect((await assetOf(harness.paths, 'design-1', 'asset-1')).attempts.length).toBe(1);
    });

    // The orphan is still `queued`, so the next start reconciles it as
    // resumable and routes it to the media queue — the real path it takes.
    await harness.coordinator.start();
    await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      expect(state.jobs.find((job) => job.id === orphan.id)?.status).toBe('failed');
    });

    // One attempt, not two: the orphan does not own the asset, so it must not
    // generate — that would be two provider calls and two charges for one press.
    expect((await assetOf(harness.paths, 'design-1', 'asset-1')).attempts).toHaveLength(1);
  });
});

describe('a video the user declines', () => {
  const harness = useCoordinator('media-declined');

  it('releases the asset so Retry still works', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-video', prompt: 'a slow pan' },
    });
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      expect(state.jobs.find((job) => job.target.kind === 'asset')?.status).toBe('failed');
    });

    // The refusal wrote no attempt, so without an explicit release the asset
    // keeps pointing at a finished job — and `media.retry` reads a live jobId
    // as "already working" and does nothing.
    const asset = await assetOf(harness.paths, 'design-1', 'asset-1');
    expect(asset.jobId).toBeUndefined();

    await appendRequest(harness.paths, {
      kind: 'media.retry',
      designId: 'design-1',
      assetId: 'asset-1',
    });
    await harness.coordinator.drain();
    await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      expect(state.jobs.filter((job) => job.target.kind === 'asset')).toHaveLength(2);
    });
  });
});
