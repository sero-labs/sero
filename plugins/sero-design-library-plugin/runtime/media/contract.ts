/**
 * The provider contract (spec §8.1).
 *
 * The application asks for a *capability* and an opaque model id; how that
 * becomes an endpoint, a request body and a polling loop is the adapter's
 * business and nobody else's. No vendor type appears here, and nothing in this
 * file may import a provider SDK — `providers/fal.ts` is the only module
 * permitted to import `@fal-ai/client`.
 *
 * The domain types a record or the UI needs — capability, provenance, error
 * codes — live in `shared/media.ts`. This file adds only what a provider needs
 * to be called, which is why none of it is persisted or projected.
 */

import type { MediaCapability, MediaErrorCode, MediaProvenance } from '../../shared/media';

export interface MediaRequest {
  capability: MediaCapability;
  prompt: string;
  /** Opaque provider model id. Defaults come from settings (spec §10). */
  model?: string;
  /** Local source assets for image-to-image and upscale. */
  sourceAssetIds?: string[];
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
  /** Adapter-owned passthrough. Never read by domain code. */
  extra?: Record<string, unknown>;
}

export interface MediaFile {
  /** Absolute path inside plugin-owned storage, as returned by `context.store`. */
  path: string;
  mediaType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface MediaResult {
  files: MediaFile[];
  provenance: MediaProvenance;
}

/**
 * A failure, in terms the caller can act on.
 *
 * `retryable` has to be honest: the tray offers a retry button on the strength
 * of it, and an authentication failure or a malformed request advertised as
 * retryable turns one wasted call into as many as the user is willing to click.
 */
export class MediaError extends Error {
  constructor(
    readonly code: MediaErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MediaError';
  }
}

export function isMediaError(value: unknown): value is MediaError {
  return value instanceof MediaError;
}

/** A local asset an adapter may upload as a source for image-to-image or upscale. */
export interface MediaSourceAsset {
  path: string;
  bytes: Uint8Array;
  mediaType: string;
}

export interface MediaContext {
  signal: AbortSignal;
  /** Writes provider output into plugin-owned storage and returns the local path. */
  store(name: string, bytes: Uint8Array | ReadableStream): Promise<string>;
  /** Resolves a local source asset for upload. */
  readAsset(assetId: string): Promise<MediaSourceAsset>;
  onProgress?(message: string): void;
}

export interface MediaProvider {
  id: string;
  displayName: string;
  capabilities(): MediaCapability[];
  defaultModel(capability: MediaCapability): string;
  generate(request: MediaRequest, context: MediaContext): Promise<MediaResult>;
}
