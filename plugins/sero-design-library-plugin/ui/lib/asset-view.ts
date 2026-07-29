import type { DesignAsset, MediaAttempt } from '../../shared/media';
import { assetCostUsd, currentAttempt, designCostUsd } from '../../shared/media';

/**
 * What the tray shows for one asset, derived rather than stored (spec §6.6).
 *
 * Pure, and separate from the component, because every interesting thing about
 * an asset tile is a question about *state* — is this running or did the process
 * that owned it die, is this the artwork or the placeholder, does Retry do
 * anything — and none of it needs a DOM to be true or to test.
 */

export type AssetState =
  | 'generating'
  | 'interrupted'
  | 'ready'
  | 'awaiting-frames'
  | 'failed';

export interface AssetView {
  id: string;
  state: AssetState;
  /** One short line under the tile. Never the raw error object. */
  status: string;
  /** The attempt the tile paints, if any. Its id is part of the image cache key. */
  attempt: MediaAttempt | undefined;
  reference: string;
  prompt: string;
  capability: DesignAsset['request']['capability'];
  kind: DesignAsset['kind'];
  costUsd: number;
  attemptCount: number;
  /** Retry is offered whenever another attempt could plausibly help. */
  canRetry: boolean;
  /** Copy to Library needs bytes, and refuses to make a second copy. */
  canCopy: boolean;
  copiedItemId: string | undefined;
  deleted: boolean;
}

const CAPABILITY_LABELS: Record<DesignAsset['request']['capability'], string> = {
  'text-to-image': 'Image',
  'image-to-image': 'Restyle',
  upscale: 'Upscale',
  'text-to-video': 'Video',
};

export function capabilityLabel(capability: DesignAsset['request']['capability']): string {
  return CAPABILITY_LABELS[capability];
}

/**
 * A video that generated before the app was open has no still frame yet.
 *
 * The renderer is what decodes video — the runtime has no image library — so a
 * clip produced while Sero was closed stays frameless until the next time the
 * app opens and can look at it. Distinguishing that from a failure matters: one
 * resolves by itself and the other needs a retry.
 */
function awaitingFrames(asset: DesignAsset, attempt: MediaAttempt): boolean {
  return asset.kind === 'video' && attempt.outcome === 'ready' && attempt.posterFile === undefined;
}

function statusOf(asset: DesignAsset, state: AssetState, attempt: MediaAttempt | undefined): string {
  switch (state) {
    case 'generating':
      return 'Generating…';
    case 'interrupted':
      // Deliberately not re-run on its own: re-running spends money the user
      // did not ask to spend twice (D10).
      return 'Interrupted — not generated';
    case 'awaiting-frames':
      return 'Waiting for a still frame';
    case 'failed':
      // An empty message is as useless as a missing one, and a provider that
      // says nothing is not a tile that should say nothing either.
      return attempt?.error?.message === undefined || attempt.error.message === ''
        ? 'The provider failed.'
        : attempt.error.message;
    case 'ready':
      return capabilityLabel(asset.request.capability);
  }
}

/**
 * Whether pressing Retry could produce anything different.
 *
 * The provider says so on the failure, and that flag is the point: a malformed
 * request fails the same way however often it is repeated, and a button that
 * promises otherwise just spends the user's patience. Two failures are offered
 * anyway — an interrupted job never ran at all, and a rejected key is fixed in
 * Settings, after which the same call is worth making.
 */
function retryable(state: AssetState, attempt: MediaAttempt | undefined): boolean {
  if (state === 'interrupted') return true;
  if (state !== 'failed') return false;
  return attempt?.error?.retryable === true || attempt?.error?.code === 'auth';
}

export function assetView(asset: DesignAsset): AssetView {
  const attempt = currentAttempt(asset);
  const state: AssetState =
    attempt === undefined
      ? asset.jobId === undefined
        ? 'interrupted'
        : 'generating'
      : attempt.outcome !== 'ready'
        ? 'failed'
        : awaitingFrames(asset, attempt)
          ? 'awaiting-frames'
          : 'ready';

  return {
    id: asset.id,
    state,
    status: statusOf(asset, state, attempt),
    attempt,
    reference: asset.reference,
    prompt: asset.request.prompt,
    capability: asset.request.capability,
    kind: asset.kind,
    costUsd: assetCostUsd(asset),
    attemptCount: asset.attempts.length,
    // Not while one is in flight: a second Retry press must not start a second
    // paid call for the same asset.
    canRetry: retryable(state, attempt) && asset.jobId === undefined,
    // A copy needs bytes, and copying twice would make a second item saying the
    // same thing — so the tray offers it once and then says it is done.
    canCopy:
      (state === 'ready' || state === 'awaiting-frames') && asset.copiedItemId === undefined,
    copiedItemId: asset.copiedItemId,
    deleted: asset.deletedAt !== undefined,
  };
}

export interface TrayView {
  assets: AssetView[];
  /** Every attempt on every live asset, so a failure that still billed counts. */
  totalCostUsd: number;
  generating: number;
}

/**
 * The tray, newest last.
 *
 * Assets keep the order they were reserved in rather than being sorted by
 * state: the page refers to them by a reference the model chose, and a tray that
 * reshuffles when one fails makes it harder to find the one you were looking at.
 */
export function trayView(assets: DesignAsset[], includeDeleted = false): TrayView {
  const live = includeDeleted ? assets : assets.filter((asset) => asset.deletedAt === undefined);
  const views = live.map(assetView);
  return {
    assets: views,
    totalCostUsd: designCostUsd(live),
    generating: views.filter((view) => view.state === 'generating').length,
  };
}

/** Cost as the tray writes it. Sub-cent spend is still spend and still shows. */
export function formatCost(usd: number): string {
  if (usd === 0) return '—';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
