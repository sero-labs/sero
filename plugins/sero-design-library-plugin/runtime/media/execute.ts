import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MediaAttempt, MediaProvenance } from '../../shared/media';
import type { MediaContext, MediaProvider, MediaRequest, MediaSourceAsset } from './contract';
import { MediaError } from './contract';

/**
 * Running one media request and describing what happened.
 *
 * This never throws. A provider failure is an *outcome* — a failed attempt that
 * becomes a placeholder with a retry button — because "provider failure does not
 * fail the whole variant" (plan, PR 3 accept list) is only true if the failure
 * arrives as data rather than as an exception unwinding a generation run.
 *
 * It is also the single place a provider result becomes files on disk, so the
 * rule that no remote URL survives contact with the plugin is enforced once: the
 * adapter is handed a `store` and has nowhere else to put its bytes.
 */

const MAX_BYTES_PER_FILE = 64 * 1024 * 1024;

export interface ExecuteMediaOptions {
  /** Directory the produced files land in. Created if it is not there. */
  directory: string;
  signal: AbortSignal;
  /** Resolves a local source for image-to-image and upscale. */
  readAsset(assetId: string): Promise<MediaSourceAsset>;
  onProgress?(message: string): void;
}

async function collect(bytes: Uint8Array | ReadableStream): Promise<Uint8Array> {
  if (bytes instanceof Uint8Array) return bytes;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = bytes.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    total += chunk.byteLength;
    // Bounded while reading rather than after: a stream that never ends would
    // otherwise be discovered only once it had filled memory.
    if (total > MAX_BYTES_PER_FILE) {
      await reader.cancel();
      throw new MediaError(
        'provider',
        `The generated file is over the ${MAX_BYTES_PER_FILE / (1024 * 1024)} MB limit.`,
        false,
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Run one request. The returned attempt is `ready` or `failed` and always
 * carries enough to explain itself.
 */
export async function executeMedia(
  provider: MediaProvider,
  request: MediaRequest,
  options: ExecuteMediaOptions,
): Promise<MediaAttempt> {
  const attemptId = randomUUID();
  const startedAt = Date.now();

  // Names are generated here, not taken from the adapter, so a provider cannot
  // choose where its bytes land. `store` is the only write it has.
  const written = new Map<string, number>();
  const context: MediaContext = {
    signal: options.signal,
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    readAsset: options.readAsset,
    async store(name, bytes) {
      const safe = `${attemptId}-${path.basename(name).replace(/[^A-Za-z0-9._-]/g, '_')}`;
      await mkdir(options.directory, { recursive: true });
      const file = path.join(options.directory, safe);
      const content = await collect(bytes);
      await writeFile(file, content);
      written.set(safe, content.byteLength);
      return file;
    },
  };

  const failure = (error: MediaError): MediaAttempt => ({
    id: attemptId,
    outcome: 'failed',
    startedAt,
    completedAt: Date.now(),
    error: { code: error.code, message: error.message, retryable: error.retryable },
  });

  // Checked here rather than left to each provider. A run cancelled while this
  // call was queued must not spend on it, and "the adapter remembers to look"
  // is not a property the tenth adapter will have.
  if (options.signal.aborted) {
    return failure(new MediaError('cancelled', 'The request was cancelled.', false));
  }

  // The call is wrapped rather than chained off `provider.generate(...)`: a
  // provider that throws *synchronously* — a typo reaching a property of
  // undefined — would escape past a rejection handler and unwind the generation
  // run, which is the one thing a provider failure must never do.
  const result = await (async () => provider.generate(request, context))().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error:
        error instanceof MediaError
          ? error
          : new MediaError('provider', error instanceof Error ? error.message : String(error), true),
    }),
  );

  if (!result.ok) return failure(result.error);

  // The adapter's own contract says it downloads everything through `store`, and
  // this is where that is checked rather than trusted. An adapter that returned a
  // path it never wrote would otherwise produce an asset pointing at nothing.
  const [file] = result.value.files;
  if (file === undefined) {
    return failure(new MediaError('provider', 'The provider returned no file.', false));
  }
  const stored = path.basename(file.path);
  const bytes = written.get(stored);
  if (bytes === undefined) {
    return failure(
      new MediaError('provider', 'The provider returned a file it never stored locally.', false),
    );
  }

  const provenance: MediaProvenance = result.value.provenance;
  return {
    id: attemptId,
    outcome: 'ready',
    startedAt,
    completedAt: Date.now(),
    file: stored,
    mediaType: file.mediaType,
    bytes,
    ...(file.width === undefined ? {} : { width: file.width }),
    ...(file.height === undefined ? {} : { height: file.height }),
    ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
    provenance,
  };
}
