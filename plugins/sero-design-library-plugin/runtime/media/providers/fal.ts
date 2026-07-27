import { ApiError, createFalClient, ValidationError } from '@fal-ai/client';

import type { MediaCapability } from '../../../shared/media';
import { MEDIA_CAPABILITIES, needsSource } from '../../../shared/media';
import type {
  MediaContext,
  MediaFile,
  MediaProvider,
  MediaRequest,
  MediaResult,
} from '../contract';
import { MediaError } from '../contract';

/**
 * The fal adapter — the only module in this plugin permitted to import
 * `@fal-ai/client` (spec §8.2, D6).
 *
 * Everything vendor-shaped is contained here: the endpoint ids, the request
 * bodies, the response shapes and the error taxonomy. What leaves is a
 * `MediaResult` holding local paths, or a `MediaError`. In particular **no
 * remote URL escapes this file** — every result is downloaded through
 * `context.store` before it is returned, because a URL that reached a preview or
 * an export would put a network dependency inside a document the whole design
 * of this plugin says has none.
 *
 * Credentials are configured at call time from a resolver and never persisted
 * here; see `runtime/media/credentials.ts` for where they come from.
 */

/**
 * One endpoint per capability (D7). The agent chooses a *capability*; a model id
 * only ever arrives from settings, where the user can edit it.
 *
 * These are defaults, not a fixed catalogue: a request carrying its own `model`
 * uses it verbatim, so a new endpoint needs a settings edit rather than a
 * release.
 */
export const FAL_DEFAULT_MODELS: Record<MediaCapability, string> = {
  'text-to-image': 'fal-ai/flux/dev',
  'image-to-image': 'fal-ai/flux/dev/image-to-image',
  upscale: 'fal-ai/clarity-upscaler',
  'text-to-video': 'fal-ai/kling-video/v1/standard/text-to-video',
};

/** fal takes a named size rather than a ratio; anything unmapped is left to it. */
const IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
};

const DOWNLOAD_TIMEOUT_MS = 120_000;

/** Result payloads differ per endpoint; this is every shape we accept. */
interface FalOutputFile {
  url?: unknown;
  content_type?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Pull the produced files out of whatever the endpoint returned.
 *
 * Endpoints are not consistent — `images[]`, `image`, `video`, `videos[]` are all
 * in use — and the client's generated types cannot help because the endpoint id
 * is a runtime string. Reading the known keys and refusing anything without a
 * URL is honest about that: an unrecognised payload fails loudly here rather
 * than becoming an asset with nothing in it.
 */
function outputFiles(data: unknown): FalOutputFile[] {
  if (!isObject(data)) return [];
  const candidates: unknown[] = [];
  for (const key of ['images', 'videos', 'files', 'outputs']) {
    const list = data[key];
    if (Array.isArray(list)) candidates.push(...list);
  }
  for (const key of ['image', 'video', 'file', 'output']) {
    if (isObject(data[key])) candidates.push(data[key]);
  }
  return candidates.filter(isObject).filter((entry) => typeof entry.url === 'string');
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The reported cost, when the endpoint reports one.
 *
 * fal does not return a price on every endpoint, so this is frequently absent —
 * and absent has to stay absent rather than becoming a zero, because "this cost
 * nothing" and "nobody said what this cost" are different claims and the tray
 * displays them differently.
 */
function reportedCost(data: unknown): number | undefined {
  if (!isObject(data)) return undefined;
  for (const key of ['cost', 'cost_usd', 'price', 'billable_cost']) {
    const value = optionalNumber(data[key]);
    if (value !== undefined) return value;
  }
  const metrics = data.metrics;
  return isObject(metrics) ? optionalNumber(metrics.cost) : undefined;
}

function fileNameFor(url: string, mediaType: string, index: number): string {
  const extensionFromType = mediaType.split('/')[1]?.split('+')[0];
  const fromUrl = /\.([A-Za-z0-9]{2,5})(?:\?|$)/.exec(url)?.[1];
  const extension = (fromUrl ?? extensionFromType ?? 'bin').toLowerCase();
  return `${Date.now()}-${index}.${extension}`;
}

/**
 * Turn any thrown value into a `MediaError` with an honest `retryable`.
 *
 * The flag decides whether the tray offers a retry button, so it has to mean
 * something: a bad key or a malformed request will fail identically however many
 * times it is repeated, and advertising those as retryable turns one wasted call
 * into as many as the user is willing to click.
 */
export function normalizeFalError(error: unknown): MediaError {
  if (error instanceof MediaError) return error;

  if (error instanceof ValidationError) {
    const fields = error.fieldErrors.map((entry) => entry.msg).join('; ');
    return new MediaError(
      'invalid-request',
      fields === '' ? error.message : `The provider rejected the request: ${fields}`,
      false,
      { cause: error },
    );
  }

  if (error instanceof ApiError) {
    const { status } = error;
    if (status === 401 || status === 403) {
      return new MediaError('auth', 'The fal API key was rejected.', false, { cause: error });
    }
    if (status === 429) {
      return new MediaError('rate-limit', 'The provider is rate limiting requests.', true, {
        cause: error,
      });
    }
    if (status >= 400 && status < 500) {
      return new MediaError('invalid-request', error.message, false, { cause: error });
    }
    return new MediaError('provider', error.message, true, { cause: error });
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new MediaError('cancelled', 'The request was cancelled.', false, { cause: error });
    }
    // Anything that never reached the provider is worth another go; the network
    // being down is the archetypal transient failure.
    return new MediaError('network', error.message, true, { cause: error });
  }

  return new MediaError('provider', String(error), true);
}

function buildInput(request: MediaRequest, sourceUrls: string[]): Record<string, unknown> {
  const size = request.aspectRatio === undefined ? undefined : IMAGE_SIZES[request.aspectRatio];
  const shared = {
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    ...request.extra,
  };

  switch (request.capability) {
    case 'text-to-image':
      return {
        prompt: request.prompt,
        num_images: 1,
        ...(size === undefined ? {} : { image_size: size }),
        ...shared,
      };
    case 'image-to-image':
      return {
        prompt: request.prompt,
        image_url: sourceUrls[0],
        ...(size === undefined ? {} : { image_size: size }),
        ...shared,
      };
    case 'upscale':
      return {
        image_url: sourceUrls[0],
        ...(request.prompt === '' ? {} : { prompt: request.prompt }),
        ...shared,
      };
    case 'text-to-video':
      return {
        prompt: request.prompt,
        ...(request.durationSeconds === undefined
          ? {}
          : { duration: String(request.durationSeconds) }),
        ...(request.aspectRatio === undefined ? {} : { aspect_ratio: request.aspectRatio }),
        ...shared,
      };
  }
}

function progressMessage(status: { status: string; queue_position?: number }): string {
  if (status.status === 'IN_QUEUE') {
    const position = status.queue_position;
    return position === undefined ? 'Queued' : `Queued, position ${position}`;
  }
  return status.status === 'IN_PROGRESS' ? 'Generating' : 'Finishing';
}

export interface FalProviderOptions {
  /**
   * Resolved at call time and never stored on the provider, so a key rotated in
   * Settings takes effect on the next call rather than on the next restart.
   */
  credentials: () => string | undefined;
  /** Overrides for `FAL_DEFAULT_MODELS`, from settings (D7). */
  models?: Partial<Record<MediaCapability, string>>;
  /**
   * Transport, for the contract tests.
   *
   * The suite runs against this adapter and the fake, and it can only do that if
   * the real mapping code — the request bodies, the response shapes, the error
   * taxonomy — actually executes. Stubbing at `fetch` runs all of it without
   * network or spend; stubbing the provider instead would test nothing that
   * ships.
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Retries are the client's, not ours.
 *
 * `queue.submit` passes its own hardcoded retry config into the request layer,
 * and a per-request config outranks the client-level one — so a `retry` option
 * on `createFalClient` has no effect on the call that matters. Four attempts on
 * a 429, with backoff, is the behaviour; the run's `AbortSignal` is threaded
 * through and stops them, which is the part we actually depend on.
 *
 * Worth stating rather than leaving to be rediscovered: an earlier version of
 * this file exposed a `maxRetries` option that silently did nothing.
 */

export function createFalProvider(options: FalProviderOptions): MediaProvider {
  const transport = options.fetch ?? globalThis.fetch;
  const client = createFalClient({
    credentials: options.credentials,
    // The runtime is a Node process, not a browser, so the client's warning
    // about exposed credentials does not apply and only adds noise to the log.
    suppressLocalCredentialsWarning: true,
    fetch: transport,
  });

  const modelFor = (capability: MediaCapability): string =>
    options.models?.[capability] ?? FAL_DEFAULT_MODELS[capability];

  return {
    id: 'fal',
    displayName: 'fal.ai',
    capabilities: () => [...MEDIA_CAPABILITIES],
    defaultModel: modelFor,

    async generate(request: MediaRequest, context: MediaContext): Promise<MediaResult> {
      const startedAt = Date.now();
      const model = request.model ?? modelFor(request.capability);

      try {
        if (options.credentials() === undefined) {
          throw new MediaError(
            'auth',
            'No fal API key is configured. Set FAL_KEY in the environment or add a key in Design Library settings.',
            false,
          );
        }

        const sourceIds = request.sourceAssetIds ?? [];
        if (needsSource(request.capability) && sourceIds.length === 0) {
          throw new MediaError(
            'invalid-request',
            `${request.capability} needs at least one source image.`,
            false,
          );
        }

        // Sources are uploaded rather than sent inline: the endpoints take a URL,
        // and the client's storage API is what turns local bytes into one.
        const sourceUrls: string[] = [];
        for (const assetId of sourceIds) {
          const asset = await context.readAsset(assetId);
          context.onProgress?.('Uploading source image');
          const blob = new Blob([new Uint8Array(asset.bytes)], { type: asset.mediaType });
          sourceUrls.push(await client.storage.upload(blob));
        }

        const input = buildInput(request, sourceUrls);
        const result = await client.subscribe(model, {
          input,
          abortSignal: context.signal,
          onQueueUpdate: (status) => context.onProgress?.(progressMessage(status)),
        });

        const produced = outputFiles(result.data);
        if (produced.length === 0) {
          throw new MediaError(
            'provider',
            `${model} returned no usable output. It may not be a ${request.capability} endpoint.`,
            false,
          );
        }

        const files: MediaFile[] = [];
        for (const [index, entry] of produced.entries()) {
          const url = entry.url as string;
          const mediaType =
            typeof entry.content_type === 'string' ? entry.content_type : 'application/octet-stream';
          context.onProgress?.('Downloading result');
          const bytes = await download(transport, url, context.signal);
          const path = await context.store(fileNameFor(url, mediaType, index), bytes);
          const duration = optionalNumber(entry.duration);
          files.push({
            path,
            mediaType,
            ...(optionalNumber(entry.width) === undefined ? {} : { width: entry.width as number }),
            ...(optionalNumber(entry.height) === undefined
              ? {}
              : { height: entry.height as number }),
            ...(duration === undefined ? {} : { durationMs: Math.round(duration * 1000) }),
          });
        }

        const seed = optionalNumber(isObject(result.data) ? result.data.seed : undefined);
        return {
          files,
          provenance: {
            providerId: 'fal',
            capability: request.capability,
            model,
            prompt: request.prompt,
            // The request as sent, so an asset can say exactly what produced it.
            // Vendor-shaped keys are fine in here: it is an opaque display bag
            // and no domain code reads a key out of it.
            parameters: input,
            ...(seed === undefined ? {} : { seed }),
            ...(reportedCost(result.data) === undefined
              ? {}
              : { costUsd: reportedCost(result.data) as number }),
            startedAt,
            completedAt: Date.now(),
          },
        };
      } catch (error) {
        if (context.signal.aborted) {
          throw new MediaError('cancelled', 'The request was cancelled.', false);
        }
        throw normalizeFalError(error);
      }
    },
  };
}

/**
 * Fetch the produced file. Bounded by its own timeout as well as the run's
 * signal: a download that hangs would otherwise hold a generation slot open
 * until the whole run timed out.
 */
async function download(
  transport: typeof globalThis.fetch,
  url: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const response = await transport(url, { signal: AbortSignal.any([signal, timeout]) });
  if (!response.ok) {
    throw new MediaError(
      'network',
      `Could not download the generated file (${response.status}).`,
      true,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
