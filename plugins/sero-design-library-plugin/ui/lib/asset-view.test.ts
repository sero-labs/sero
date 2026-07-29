import { describe, expect, it } from 'vitest';

import type { DesignAsset, MediaAttempt, MediaProvenance } from '../../shared/media';
import { assetView, formatCost, trayView } from './asset-view';

/**
 * The tray's states, which are the part of it worth testing.
 *
 * Two of these are the difference between a working tray and a broken one: an
 * asset whose process died must not show the same spinner as one that is
 * running, and a successful retry must replace what is shown without hiding the
 * failure it replaced.
 */

const PROVENANCE: MediaProvenance = {
  providerId: 'fal',
  capability: 'text-to-image',
  model: 'test-model',
  prompt: 'a gradient',
  parameters: {},
  startedAt: 0,
  completedAt: 1,
};

function asset(overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    reference: 'assets/asset-1.png',
    request: { capability: 'text-to-image', prompt: 'a gradient' },
    attempts: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function attempt(overrides: Partial<MediaAttempt> & { id: string }): MediaAttempt {
  return { outcome: 'ready', startedAt: 0, completedAt: 1, ...overrides };
}

describe('what the tray shows for one asset', () => {
  it('separates an asset that is running from one whose process died', () => {
    expect(assetView(asset({ jobId: 'job-1' })).state).toBe('generating');

    // No attempts and no live job: a run that died holding it. It comes back as
    // a retryable placeholder rather than re-running, because re-running spends
    // money the user did not ask to spend twice.
    const abandoned = assetView(asset());
    expect(abandoned.state).toBe('interrupted');
    expect(abandoned.canRetry).toBe(true);
  });

  it('shows the newest attempt while the failure it replaced stays counted', () => {
    const view = assetView(
      asset({
        attempts: [
          attempt({
            id: 'a1',
            outcome: 'failed',
            provenance: { ...PROVENANCE, costUsd: 0.01 },
            error: { code: 'provider', message: 'The provider failed.', retryable: true },
          }),
          attempt({ id: 'a2', file: 'art.png', provenance: { ...PROVENANCE, costUsd: 0.02 } }),
        ],
      }),
    );

    expect(view.state).toBe('ready');
    expect(view.attempt?.id).toBe('a2');
    expect(view.attemptCount).toBe(2);
    // A failure that still billed is still spend.
    expect(view.costUsd).toBeCloseTo(0.03);
  });

  it('reports a failure with the provider’s own words, never an empty message', () => {
    const view = assetView({
      ...asset(),
      attempts: [
        attempt({
          id: 'a1',
          outcome: 'failed',
          error: { code: 'provider', message: '', retryable: true },
        }),
      ],
    });

    expect(view.state).toBe('failed');
    expect(view.status).toBe('The provider failed.');
    expect(view.canRetry).toBe(true);
  });

  it('offers no retry for a failure that would fail the same way again', () => {
    // The provider says a malformed request is not retryable, and a button that
    // promises otherwise only spends the user's patience.
    const rejected = assetView({
      ...asset(),
      attempts: [
        attempt({
          id: 'a1',
          outcome: 'failed',
          error: { code: 'invalid-request', message: 'Input should be 5 or 10.', retryable: false },
        }),
      ],
    });
    expect(rejected.canRetry).toBe(false);

    // A rejected key is the exception: it is fixed in Settings, and then the
    // same call is worth making.
    const badKey = assetView({
      ...asset(),
      attempts: [
        attempt({
          id: 'a1',
          outcome: 'failed',
          error: { code: 'auth', message: 'The fal API key was rejected.', retryable: false },
        }),
      ],
    });
    expect(badKey.canRetry).toBe(true);
  });

  it('will not offer a second retry while one is in flight', () => {
    const view = assetView(
      asset({
        jobId: 'job-2',
        attempts: [attempt({ id: 'a1', outcome: 'failed' })],
      }),
    );

    // A second Retry press must not start a second paid call for one asset.
    expect(view.canRetry).toBe(false);
  });

  it('treats a video with no still frame as waiting, not as broken', () => {
    const view = assetView(
      asset({
        kind: 'video',
        request: { capability: 'text-to-video', prompt: 'a slow pan' },
        attempts: [attempt({ id: 'a1', file: 'clip.mp4', mediaType: 'video/mp4' })],
      }),
    );

    // Generated while Sero was closed: the renderer decodes the frame, so this
    // resolves by itself on next open and must not offer a retry that spends.
    expect(view.state).toBe('awaiting-frames');
    expect(view.canRetry).toBe(false);
    // It is still real artwork, so it can still be copied to the Library.
    expect(view.canCopy).toBe(true);
  });

  it('offers Copy to Library once and then says it is done', () => {
    const ready = asset({ attempts: [attempt({ id: 'a1', file: 'art.png' })] });

    expect(assetView(ready).canCopy).toBe(true);
    expect(assetView({ ...ready, copiedItemId: 'item-9' }).canCopy).toBe(false);
    expect(assetView({ ...ready, sourceItemId: 'item-source' }).canCopy).toBe(false);
  });

  it('will not copy an asset that has no bytes', () => {
    expect(assetView(asset({ jobId: 'job-1' })).canCopy).toBe(false);
    expect(
      assetView(asset({ attempts: [attempt({ id: 'a1', outcome: 'failed' })] })).canCopy,
    ).toBe(false);
  });
});

describe('the tray as a whole', () => {
  it('hides deleted assets from the count and the total unless asked', () => {
    const assets = [
      asset({ id: 'a', attempts: [attempt({ id: '1', provenance: { ...PROVENANCE, costUsd: 0.02 } })] }),
      asset({
        id: 'b',
        deletedAt: 1,
        attempts: [attempt({ id: '2', provenance: { ...PROVENANCE, costUsd: 0.05 } })],
      }),
    ];

    const live = trayView(assets);
    expect(live.assets).toHaveLength(1);
    expect(live.totalCostUsd).toBeCloseTo(0.02);

    expect(trayView(assets, true).assets).toHaveLength(2);
  });

  it('keeps assets in the order they were reserved', () => {
    const views = trayView([
      asset({ id: 'first', jobId: 'job-1' }),
      asset({ id: 'second', attempts: [attempt({ id: '1', file: 'art.png' })] }),
      asset({ id: 'third', attempts: [attempt({ id: '2', outcome: 'failed' })] }),
    ]);

    // Not sorted by state: the page refers to these by reference, and a tray
    // that reshuffles when one fails hides the one you were looking at.
    expect(views.assets.map((view) => view.id)).toEqual(['first', 'second', 'third']);
    expect(views.generating).toBe(1);
  });
});

describe('cost as the tray writes it', () => {
  it('shows sub-cent spend rather than rounding it to nothing', () => {
    expect(formatCost(0)).toBe('—');
    // $0.00 would read as free, and it is not.
    expect(formatCost(0.004)).toBe('$0.0040');
    expect(formatCost(0.42)).toBe('$0.42');
  });
});
