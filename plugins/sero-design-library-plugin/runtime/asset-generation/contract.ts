/**
 * Provider-neutral generated-asset contract.
 *
 * No provider client type, request shape or error shape may cross this
 * boundary. Swapping provider means writing another adapter, not touching
 * Design, Gallery, preview or UI code.
 */

import type { GeneratedAssetProvenance } from '../../shared/types';

export type AssetCapability = 'illustration' | 'texture' | 'background';

export interface AssetGenerationRequest {
  /** What the image should depict. Written by the model during generation. */
  prompt: string;
  capability: AssetCapability;
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  /** Deterministic runs when the provider supports it. */
  seed?: number;
}

export interface AssetGenerationContext {
  signal?: AbortSignal;
  /** Resolves a per-profile secret by name, e.g. `fal`. */
  secret(name: string): Promise<string | null>;
  now(): number;
}

export interface GeneratedAssetBytes {
  data: Uint8Array;
  mimeType: string;
  fileExtension: string;
}

export interface AssetGenerationSuccess {
  ok: true;
  asset: GeneratedAssetBytes;
  provenance: GeneratedAssetProvenance;
}

export type AssetErrorKind =
  | 'not-configured'
  | 'rate-limited'
  | 'provider-error'
  | 'network'
  | 'cancelled'
  | 'invalid-request';

export interface AssetGenerationFailure {
  ok: false;
  kind: AssetErrorKind;
  message: string;
  retryable: boolean;
}

export type AssetGenerationResult = AssetGenerationSuccess | AssetGenerationFailure;

export interface AssetGenerationProvider {
  id: string;
  capabilities(): AssetCapability[];
  generate(
    request: AssetGenerationRequest,
    context: AssetGenerationContext,
  ): Promise<AssetGenerationResult>;
}

export function assetFailure(
  kind: AssetErrorKind,
  message: string,
  retryable = kind === 'rate-limited' || kind === 'network' || kind === 'provider-error',
): AssetGenerationFailure {
  return { ok: false, kind, message, retryable };
}
