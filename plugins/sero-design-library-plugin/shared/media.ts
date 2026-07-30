/**
 * Media as the rest of the plugin sees it (spec §8).
 *
 * Everything here is capability-shaped and vendor-neutral: a capability name, an
 * opaque model id and a record of what was asked for. The provider contract and
 * the adapter that speaks to fal live in `runtime/media/`, and nothing from
 * there — no client type, no endpoint id, no response shape — is allowed to
 * reach the UI, the domain or a persisted record (spec §8.1).
 */

import type { MediaKind } from './records';
import { isSafeId } from './safe-id';

export type MediaCapability = 'text-to-image' | 'image-to-image' | 'upscale' | 'text-to-video';

export const MEDIA_CAPABILITIES: readonly MediaCapability[] = [
  'text-to-image',
  'image-to-image',
  'upscale',
  'text-to-video',
] as const;

export function isMediaCapability(value: unknown): value is MediaCapability {
  return typeof value === 'string' && (MEDIA_CAPABILITIES as readonly string[]).includes(value);
}

/** Capabilities that consume local source assets, so callers can check before asking. */
export const SOURCE_CAPABILITIES: readonly MediaCapability[] = ['image-to-image', 'upscale'] as const;

export function needsSource(capability: MediaCapability): boolean {
  return (SOURCE_CAPABILITIES as readonly string[]).includes(capability);
}

/** The one capability that always costs a confirmation before it runs (D10). */
export function needsConfirmation(capability: MediaCapability): boolean {
  return capability === 'text-to-video';
}

/**
 * The longest clip anything may ask for.
 *
 * Providers bill video by the second, so an unbounded duration is an unbounded
 * charge — and the number arrives from a model, which will happily ask for a
 * minute of footage to illustrate a header. The cap is generous for the thing
 * video is for here and small enough that a mistake is survivable.
 */
export const MAX_VIDEO_SECONDS = 12;

/**
 * The length a clip runs to when nobody said.
 *
 * Video is the one capability billed by the second, so "unspecified" cannot mean
 * "whatever the model behind it happens to default to": the confirmation the
 * user answers has to state the length they are approving, and it can only state
 * a number this side knows.
 */
export const DEFAULT_VIDEO_SECONDS = 5;

/** Clamp a requested duration into range, or drop it if it is not a number. */
export function boundedDuration(seconds: number | undefined): number | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(Math.round(seconds), MAX_VIDEO_SECONDS);
}

/**
 * What one model will actually accept, as the provider reports it (D7).
 *
 * Vendor-neutral by construction: lengths in seconds and ratios as `w:h`, with
 * no endpoint, schema or SDK type in sight. Every field is optional because
 * "the provider could not say" is a real answer — a private endpoint, a schema
 * that has moved, a machine with no network at that moment — and it is a
 * different answer from "anything goes".
 *
 * The settling rules live in `media-options.ts`; this is here because it is
 * persisted into reactive state for the UI's pickers.
 */
export interface MediaModelOptions {
  /** The only lengths this model accepts, ascending. */
  durationsSeconds?: number[];
  /** A continuous range of lengths, when the model takes one. */
  durationRange?: { min: number; max: number };
  /** The only aspect ratios this model accepts, as `w:h`. */
  aspectRatios?: string[];
}

export function normalizeModelOptions(value: unknown): MediaModelOptions {
  if (!isRecordObject(value)) return {};
  const durations = Array.isArray(value.durationsSeconds)
    ? value.durationsSeconds.filter(
        (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > 0,
      )
    : undefined;
  const range = isRecordObject(value.durationRange) ? value.durationRange : undefined;
  const min = optionalNumber(range?.min);
  const max = optionalNumber(range?.max);
  const ratios = Array.isArray(value.aspectRatios)
    ? value.aspectRatios.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : undefined;
  return {
    ...(durations === undefined || durations.length === 0 ? {} : { durationsSeconds: durations }),
    ...(min === undefined || max === undefined || max < min ? {} : { durationRange: { min, max } }),
    ...(ratios === undefined || ratios.length === 0 ? {} : { aspectRatios: ratios }),
  };
}

export function kindFor(capability: MediaCapability): MediaKind {
  return capability === 'text-to-video' ? 'video' : 'image';
}

export type MediaErrorCode =
  | 'auth'
  | 'rate-limit'
  | 'invalid-request'
  | 'provider'
  | 'network'
  | 'cancelled';

/**
 * What produced an asset, in the plugin's own vocabulary (spec §8.4).
 *
 * `parameters` is a plain bag rather than a typed shape because what a capability
 * accepts differs per model, and pinning it here would put vendor knowledge in a
 * persisted record. Domain code displays it and never reads a key out of it.
 */
export interface MediaProvenance {
  providerId: string;
  capability: MediaCapability;
  /** Opaque model id. Never parsed, never mapped back to an endpoint here. */
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  seed?: number;
  costUsd?: number;
  startedAt: number;
  completedAt: number;
}

/**
 * A generation request as it is stored — enough to repeat it exactly.
 *
 * An asset-only retry replays this rather than re-deriving it from the page or
 * the prompt that once asked for it, so a retry months later produces the thing
 * that was originally asked for (spec §6.6).
 */
export interface StoredMediaRequest {
  capability: MediaCapability;
  prompt: string;
  model?: string;
  /** Library item ids or sibling asset ids used as sources. */
  sourceAssetIds?: string[];
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
}

/**
 * One attempt at producing an asset.
 *
 * Attempts accumulate rather than overwrite. A failed attempt shows a placeholder
 * with retry, and a successful retry replaces what the tray shows while the
 * failure stays on the record — "preserves history" (spec §6.6) is only true if
 * the attempt that failed is still something you can look at.
 */
export interface MediaAttempt {
  id: string;
  outcome: 'ready' | 'failed';
  startedAt: number;
  completedAt: number;
  /** File name inside the asset directory. Present on a `ready` attempt. */
  file?: string;
  /** Still frame for a video, so a tray of assets does not decode video to paint. */
  posterFile?: string;
  mediaType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  provenance?: MediaProvenance;
  error?: { code: MediaErrorCode; message: string; retryable: boolean };
}

/**
 * One asset in a Design's tray (spec §6.6).
 *
 * Assets belong to the Design, not to a variant: the same artwork is reusable
 * across variants and stays until it is deleted. `originVariantId` records which
 * variant's run asked for it, for display only.
 */
export interface DesignAsset {
  id: string;
  kind: MediaKind;
  /** Library artwork copied in when this Design was created. */
  sourceItemId?: string;
  /** How the page refers to it, e.g. `assets/<id>.image`. Stable across retries. */
  reference: string;
  request: StoredMediaRequest;
  /** Oldest first; the last one is what the tray shows. */
  attempts: MediaAttempt[];
  createdAt: number;
  updatedAt: number;
  originVariantId?: string;
  /**
   * The job currently responsible for producing it.
   *
   * An asset with no attempts and a live job is generating; one with no attempts
   * and no live job belonged to a process that died, and reconciliation turns it
   * into a retryable failure. The same shape the variants use, for the same
   * reason: a spinner nobody owns never stops on its own.
   */
  jobId?: string;
  /** Set once Copy to Library has made an independent item from it. */
  copiedItemId?: string;
  deletedAt?: number;
}

/** The attempt the tray renders: the most recent one, whatever it did. */
export function currentAttempt(asset: DesignAsset): MediaAttempt | undefined {
  return asset.attempts[asset.attempts.length - 1];
}

export function assetIsReady(asset: DesignAsset): boolean {
  return currentAttempt(asset)?.outcome === 'ready';
}

/** Nothing has come back yet — either still running, or abandoned by a dead run. */
export function assetIsPending(asset: DesignAsset): boolean {
  return asset.attempts.length === 0;
}

/** Reported cost across every attempt — a failed one that still billed counts. */
export function assetCostUsd(asset: DesignAsset): number {
  return asset.attempts.reduce((total, attempt) => total + (attempt.provenance?.costUsd ?? 0), 0);
}

export function designCostUsd(assets: DesignAsset[]): number {
  return assets.reduce((total, asset) => total + assetCostUsd(asset), 0);
}

/**
 * What the UI is allowed to know about the provider key (spec §8.3).
 *
 * Never the key itself: the resolved value stays in the runtime, out of reactive
 * state and out of every tool result.
 */
export type CredentialStatus = 'env' | 'stored' | 'missing';

export const ASSETS_REFERENCE_PREFIX = 'assets/';

/** Reference a generated page uses, and the name the file takes on disk. */
export function assetReference(fileName: string): string {
  return `${ASSETS_REFERENCE_PREFIX}${fileName}`;
}

/**
 * The reference an asset will carry, derived from its id alone.
 *
 * Reservation and the tool that allocates the id both need this, and they must
 * agree: the tool tells its caller the path to write into the page before the
 * asset exists, and reservation fixes that path for good. Deriving it twice is
 * how the two would drift.
 */
export function assetReferenceFor(assetId: string, capability: MediaCapability): string {
  return assetReference(`${assetId}.${kindFor(capability) === 'video' ? 'mp4' : 'image'}`);
}

/**
 * Whether a request carries what its capability needs, or why it does not.
 *
 * Both routes in check this — the tool the model calls inside a generation run
 * and the explicit action the UI queues — because D5's "one implementation, no
 * divergence" has to cover the refusal as well as the call. A missing source
 * that got through here would surface as a provider error instead, after the
 * spend decision had already been taken.
 */
export function missingRequirement(
  capability: MediaCapability,
  request: { prompt?: string; sourceIds?: readonly string[] },
  sourceParam = 'sourceId',
): string | null {
  // Upscale is the one capability with nothing to describe: it works from the
  // source, and a prompt is only optional guidance for the upscaler.
  if (capability !== 'upscale' && (request.prompt ?? '').trim() === '') {
    return 'This needs a prompt describing what to produce.';
  }
  if (needsSource(capability) && (request.sourceIds ?? []).length === 0) {
    return `This needs a \`${sourceParam}\` naming an asset or Library item to work from.`;
  }
  return null;
}

export function isAssetReference(value: string): boolean {
  return value.startsWith(ASSETS_REFERENCE_PREFIX);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function withOptional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

export function normalizeProvenance(value: unknown): MediaProvenance | undefined {
  if (!isRecordObject(value)) return undefined;
  if (!isMediaCapability(value.capability)) return undefined;
  return {
    providerId: typeof value.providerId === 'string' ? value.providerId : 'unknown',
    capability: value.capability,
    model: typeof value.model === 'string' ? value.model : '',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    parameters: isRecordObject(value.parameters) ? value.parameters : {},
    ...withOptional('seed', optionalNumber(value.seed)),
    ...withOptional('costUsd', optionalNumber(value.costUsd)),
    startedAt: optionalNumber(value.startedAt) ?? 0,
    completedAt: optionalNumber(value.completedAt) ?? 0,
  };
}

function normalizeError(value: unknown): MediaAttempt['error'] {
  if (!isRecordObject(value)) return undefined;
  const code = value.code;
  const known =
    code === 'auth' ||
    code === 'rate-limit' ||
    code === 'invalid-request' ||
    code === 'provider' ||
    code === 'network' ||
    code === 'cancelled';
  return {
    code: known ? code : 'provider',
    message: typeof value.message === 'string' ? value.message : 'The provider failed.',
    retryable: value.retryable === true,
  };
}

export function normalizeStoredRequest(value: unknown): StoredMediaRequest | null {
  if (!isRecordObject(value) || !isMediaCapability(value.capability)) return null;
  return {
    capability: value.capability,
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    ...withOptional('model', optionalString(value.model)),
    ...(Array.isArray(value.sourceAssetIds)
      ? {
          sourceAssetIds: value.sourceAssetIds.filter(
            (entry): entry is string => typeof entry === 'string',
          ),
        }
      : {}),
    ...withOptional('aspectRatio', optionalString(value.aspectRatio)),
    ...withOptional('seed', optionalNumber(value.seed)),
    ...withOptional('durationSeconds', optionalNumber(value.durationSeconds)),
  };
}

function normalizeAttempt(value: unknown): MediaAttempt | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || !isSafeId(value.id)) return null;
  const file = optionalString(value.file);
  const posterFile = optionalString(value.posterFile);
  return {
    id: value.id,
    outcome: value.outcome === 'ready' ? 'ready' : 'failed',
    startedAt: optionalNumber(value.startedAt) ?? 0,
    completedAt: optionalNumber(value.completedAt) ?? 0,
    ...withOptional('file', file !== undefined && isSafeId(file) ? file : undefined),
    ...withOptional('posterFile', posterFile !== undefined && isSafeId(posterFile) ? posterFile : undefined),
    ...withOptional('mediaType', optionalString(value.mediaType)),
    ...withOptional('bytes', optionalNumber(value.bytes)),
    ...withOptional('width', optionalNumber(value.width)),
    ...withOptional('height', optionalNumber(value.height)),
    ...withOptional('durationMs', optionalNumber(value.durationMs)),
    ...withOptional('provenance', normalizeProvenance(value.provenance)),
    ...withOptional('error', normalizeError(value.error)),
  };
}

/**
 * Validate an asset read from disk, on the same contract as every other record:
 * an entry this version cannot read resolves to null and is skipped, rather than
 * being handed back unchecked to code that will dereference it.
 */
export function normalizeDesignAsset(value: unknown): DesignAsset | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || !isSafeId(value.id)) return null;
  if (typeof value.reference === 'string' && !/^assets\/[A-Za-z0-9._-]+$/.test(value.reference)) {
    return null;
  }
  const request = normalizeStoredRequest(value.request);
  if (!request) return null;
  const attempts = Array.isArray(value.attempts)
    ? value.attempts.flatMap((entry) => {
        const attempt = normalizeAttempt(entry);
        return attempt === null ? [] : [attempt];
      })
    : [];
  return {
    id: value.id,
    kind: value.kind === 'video' ? 'video' : 'image',
    reference: typeof value.reference === 'string' ? value.reference : assetReference(value.id),
    request,
    attempts,
    createdAt: optionalNumber(value.createdAt) ?? 0,
    updatedAt: optionalNumber(value.updatedAt) ?? 0,
    ...withOptional('sourceItemId', optionalString(value.sourceItemId)),
    ...withOptional('originVariantId', optionalString(value.originVariantId)),
    ...withOptional('jobId', optionalString(value.jobId)),
    ...withOptional('copiedItemId', optionalString(value.copiedItemId)),
    ...withOptional('deletedAt', optionalNumber(value.deletedAt)),
  };
}
