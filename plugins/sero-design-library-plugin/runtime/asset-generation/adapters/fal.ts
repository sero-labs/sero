/**
 * fal.ai adapter — the first implementation of the provider-neutral contract.
 *
 * Uses the official fal.ai JavaScript client. Everything fal-specific stops
 * here: the client, the endpoint id, the input shape and the error types. The
 * rest of the plugin only ever sees `AssetGenerationResult`.
 *
 * The generated image is downloaded into Design storage by the caller, so no
 * remote fal URL ever reaches a preview or an export.
 */

import { ApiError, createFalClient, type FalClient } from '@fal-ai/client';

import {
  assetFailure,
  type AssetCapability,
  type AssetGenerationContext,
  type AssetGenerationProvider,
  type AssetGenerationRequest,
  type AssetGenerationResult,
} from '../contract';

const FAL_MODEL = 'fal-ai/flux/schnell';

const IMAGE_SIZES = {
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
} as const satisfies Record<string, string>;

type FalImageSize = (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES];

function imageSize(aspectRatio: AssetGenerationRequest['aspectRatio']): FalImageSize {
  return IMAGE_SIZES[aspectRatio ?? '1:1'] ?? 'square_hd';
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** The subset of the fal response this adapter reads. */
interface FalImageOutput {
  images?: Array<{ url?: string; content_type?: string }>;
  seed?: number;
}

export interface FalAdapterOptions {
  /** Injected in tests. Defaults to the real fal client. */
  createClient?: (credentials: string) => FalClient;
  /** Injected in tests. Used only to download the produced image. */
  fetchImpl?: typeof fetch;
}

function classify(error: unknown): AssetGenerationResult {
  if (error instanceof ApiError) {
    if (error.status === 429) return assetFailure('rate-limited', 'fal.ai rate limit reached.');
    if (error.status === 401 || error.status === 403) {
      return assetFailure('not-configured', 'The fal.ai credential was rejected.', false);
    }
    if (error.status >= 400 && error.status < 500) {
      return assetFailure('invalid-request', `fal.ai rejected the request: ${error.message}`, false);
    }
    return assetFailure('provider-error', `fal.ai responded with ${error.status}.`);
  }
  return assetFailure('network', error instanceof Error ? error.message : 'Network failure.');
}

export function createFalAdapter(options: FalAdapterOptions = {}): AssetGenerationProvider {
  const makeClient = options.createClient
    ?? ((credentials: string) => createFalClient({ credentials }));
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    id: 'fal',

    capabilities(): AssetCapability[] {
      return ['illustration', 'texture', 'background'];
    },

    async generate(
      request: AssetGenerationRequest,
      context: AssetGenerationContext,
    ): Promise<AssetGenerationResult> {
      if (!request.prompt.trim()) {
        return assetFailure('invalid-request', 'An asset prompt is required.', false);
      }

      const credentials = await context.secret('fal');
      if (!credentials) {
        return assetFailure(
          'not-configured',
          'No fal.ai credential is configured for this profile. Add a `fal` entry to Sero credentials or set FAL_KEY.',
          false,
        );
      }

      const startedAt = context.now();
      let output: FalImageOutput;
      let requestId: string;

      try {
        const result = await makeClient(credentials).subscribe(FAL_MODEL, {
          input: {
            prompt: request.prompt,
            image_size: imageSize(request.aspectRatio),
            num_images: 1,
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          },
          ...(context.signal ? { abortSignal: context.signal } : {}),
        });
        output = result.data as FalImageOutput;
        requestId = result.requestId;
      } catch (error) {
        if (context.signal?.aborted) {
          return assetFailure('cancelled', 'Asset generation was cancelled.', true);
        }
        return classify(error);
      }

      const image = output.images?.[0];
      if (!image?.url) return assetFailure('provider-error', 'fal.ai returned no image.');

      let bytes: ArrayBuffer;
      let contentType = image.content_type ?? 'image/png';
      try {
        const download = await doFetch(image.url, context.signal ? { signal: context.signal } : {});
        if (!download.ok) {
          return assetFailure('provider-error', `Downloading the generated image failed with ${download.status}.`);
        }
        contentType = download.headers.get('content-type') ?? contentType;
        bytes = await download.arrayBuffer();
      } catch (error) {
        if (context.signal?.aborted) {
          return assetFailure('cancelled', 'Asset generation was cancelled.', true);
        }
        return assetFailure('network', error instanceof Error ? error.message : 'Download failed.');
      }

      const mimeType = contentType.split(';')[0].trim();

      return {
        ok: true,
        asset: {
          data: new Uint8Array(bytes),
          mimeType,
          fileExtension: MIME_EXTENSIONS[mimeType] ?? 'png',
        },
        provenance: {
          toolId: 'design_library_generate_asset',
          providerId: 'fal',
          modelId: FAL_MODEL,
          prompt: request.prompt,
          parameters: {
            capability: request.capability,
            aspectRatio: request.aspectRatio ?? '1:1',
          },
          ...(output.seed !== undefined ? { seed: String(output.seed) } : {}),
          startedAt,
          completedAt: context.now(),
          providerExtension: { requestId },
        },
      };
    },
  };
}
