import { describe, expect, it, vi } from 'vitest';

import { currentAttempt } from '../shared/media';
import { appendRequest, readStateWithIndexes } from '../shared/state-io';

import { useCoordinator } from './coordinator-harness';
import { readDesign } from './design-store';
import { listJobs, readItem } from './store';
import { seedDesign } from './test-fixtures';

/**
 * Media through the request log, end to end (spec §6.6, §8.4).
 *
 * The provider is the deterministic fake, injected at the coordinator, so this
 * covers the whole path — request, job, provider call, record, projection —
 * without network or spend. What it is really checking is the parts that only
 * exist because the log is applied *at-least-once*: applying the same request
 * twice must not produce a second asset, or a second paid call.
 */

const harness = useCoordinator('media');

async function waitForAsset(designId: string, assetId: string) {
  return vi.waitFor(async () => {
    const design = await readDesign(harness.paths, designId);
    const asset = design?.assets.find((entry) => entry.id === assetId);
    expect(asset?.attempts.length).toBeGreaterThan(0);
    return asset!;
  });
}

describe('generating an asset into a Design', () => {
  it('reserves, generates and records it', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();

    const asset = await waitForAsset('design-1', 'asset-1');
    expect(currentAttempt(asset)?.outcome).toBe('ready');
    expect(currentAttempt(asset)?.provenance?.prompt).toBe('a wide hero');
    expect(asset.reference).toContain('asset-1');
  });

  it('does not generate twice when the request is applied twice', async () => {
    await seedDesign(harness.paths, 'design-1');
    const body = {
      kind: 'media.generate' as const,
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image' as const, prompt: 'a wide hero' },
    };

    await appendRequest(harness.paths, body);
    await harness.coordinator.drain();
    await waitForAsset('design-1', 'asset-1');

    // The replay a crash between applying and recording would produce.
    await appendRequest(harness.paths, body);
    await harness.coordinator.drain();

    const design = await readDesign(harness.paths, 'design-1');
    expect(design?.assets).toHaveLength(1);
    // One attempt, so one paid call — the whole reason the id is allocated by
    // the caller rather than minted in the handler.
    expect(design?.assets[0].attempts).toHaveLength(1);
  });

  it('retries in place, keeping the reference and the failure', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'upscale', prompt: '' },
    });
    await harness.coordinator.drain();

    // Upscale with no source fails, which is the placeholder case.
    const failed = await waitForAsset('design-1', 'asset-1');
    expect(currentAttempt(failed)?.outcome).toBe('failed');

    await appendRequest(harness.paths, {
      kind: 'media.retry',
      designId: 'design-1',
      assetId: 'asset-1',
    });
    await harness.coordinator.drain();

    const design = await vi.waitFor(async () => {
      const current = await readDesign(harness.paths, 'design-1');
      expect(current?.assets[0].attempts.length).toBe(2);
      return current!;
    });
    expect(design.assets).toHaveLength(1);
    expect(design.assets[0].reference).toBe(failed.reference);
    // The first failure is still on the record — a retry adds, never replaces.
    expect(design.assets[0].attempts[0].outcome).toBe('failed');
  });

  it('hides a deleted asset and restores it, without touching its files', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    const asset = await waitForAsset('design-1', 'asset-1');

    await appendRequest(harness.paths, {
      kind: 'media.delete',
      designId: 'design-1',
      assetId: 'asset-1',
      deleted: true,
    });
    await harness.coordinator.drain();
    expect((await readDesign(harness.paths, 'design-1'))?.assets[0].deletedAt).toBeDefined();

    await appendRequest(harness.paths, {
      kind: 'media.delete',
      designId: 'design-1',
      assetId: 'asset-1',
      deleted: false,
    });
    await harness.coordinator.drain();

    const restored = (await readDesign(harness.paths, 'design-1'))?.assets[0];
    expect(restored?.deletedAt).toBeUndefined();
    // Deletion is a mark, not a removal, so the attempt it had is still there.
    expect(restored?.attempts).toEqual(asset.attempts);
  });
});

describe('copy to library', () => {
  it('makes an independent item that keeps its generation provenance', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    await waitForAsset('design-1', 'asset-1');

    await appendRequest(harness.paths, {
      kind: 'media.copy-to-library',
      designId: 'design-1',
      assetId: 'asset-1',
    });
    await harness.coordinator.drain();

    const design = await readDesign(harness.paths, 'design-1');
    const itemId = design?.assets[0].copiedItemId;
    expect(itemId).toBeDefined();

    const item = await readItem(harness.paths, itemId as string);
    expect(item?.source.kind).toBe('generated');
    expect(item?.generation?.prompt).toBe('a wide hero');
    // Independent: it owns its own bytes under its own item directory.
    expect(item?.asset.originalFile).toMatch(/^original\./);
  });

  it('copies once however often the request lands', async () => {
    await seedDesign(harness.paths, 'design-1');
    await appendRequest(harness.paths, {
      kind: 'media.generate',
      designId: 'design-1',
      assetId: 'asset-1',
      request: { capability: 'text-to-image', prompt: 'a wide hero' },
    });
    await harness.coordinator.drain();
    await waitForAsset('design-1', 'asset-1');

    const copy = {
      kind: 'media.copy-to-library' as const,
      designId: 'design-1',
      assetId: 'asset-1',
    };
    await appendRequest(harness.paths, copy);
    await harness.coordinator.drain();
    await appendRequest(harness.paths, copy);
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    // One item, not two: the recorded item id is what refuses the second copy.
    expect(state.items.filter((item) => item.sourceKind === 'generated')).toHaveLength(1);
  });
});

describe('generating into the Library', () => {
  it('creates an item and starts analysing it', async () => {
    await appendRequest(harness.paths, {
      kind: 'library.generate',
      slotId: 'slot-1',
      capability: 'text-to-image',
      prompt: 'brutalist poster grid',
    });
    await harness.coordinator.drain();

    const itemId = await vi.waitFor(async () => {
      const state = await readStateWithIndexes(harness.paths);
      const generated = state.items.find((item) => item.sourceKind === 'generated');
      expect(generated).toBeDefined();
      return generated!.id;
    });

    // Generated items take the ordinary import route, so analysis starts by
    // itself exactly as it does for a file the user dropped in.
    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.status).toBe('ready');
    });
    expect((await readItem(harness.paths, itemId))?.generation?.prompt).toBe(
      'brutalist poster grid',
    );
  });

  it('never leaves a job that exists but has nothing to generate', async () => {
    // The job and the thing it is meant to generate are one write. Two writes
    // left a crash window where the job existed empty — and the slot could not
    // recover, because a slot that already has a job is exactly how the replay
    // knows not to start a second one.
    await appendRequest(harness.paths, {
      kind: 'library.generate',
      slotId: 'slot-atomic',
      capability: 'text-to-image',
      prompt: 'brutalist poster grid',
    });
    await harness.coordinator.drain();

    const jobs = await listJobs(harness.paths);
    const slotJobs = jobs.filter(
      (job) => job.target.kind === 'library' && job.target.slotId === 'slot-atomic',
    );
    expect(slotJobs).toHaveLength(1);
    expect(slotJobs[0]?.media?.prompt).toBe('brutalist poster grid');
  });

  it('starts one generation however often the request lands', async () => {
    const body = {
      kind: 'library.generate' as const,
      slotId: 'slot-1',
      capability: 'text-to-image' as const,
      prompt: 'brutalist poster grid',
    };
    await appendRequest(harness.paths, body);
    await harness.coordinator.drain();
    await appendRequest(harness.paths, body);
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      const state = await readStateWithIndexes(harness.paths);
      expect(state.items.filter((item) => item.sourceKind === 'generated')).toHaveLength(1);
    });
  });
});

describe('video confirmation', () => {
  it('does not generate a video the user declined', async () => {
    // The harness answers the confirmation with "skip", which is what a prompt
    // nobody answered also produces. Either way it must not spend.
    await appendRequest(harness.paths, {
      kind: 'library.generate',
      slotId: 'slot-video',
      capability: 'text-to-video',
      prompt: 'a slow pan across a city',
    });
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      const state = await readStateWithIndexes(harness.paths);
      expect(state.jobs.find((job) => job.target.kind === 'library')?.status).toBe('failed');
    });
    expect((await readStateWithIndexes(harness.paths)).items).toEqual([]);
  });
});
