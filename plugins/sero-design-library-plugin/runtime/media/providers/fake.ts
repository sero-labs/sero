import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import type { MediaCapability } from '../../../shared/media';
import { MEDIA_CAPABILITIES, needsSource } from '../../../shared/media';
import type { MediaContext, MediaProvider, MediaRequest, MediaResult } from '../contract';
import { MediaError } from '../contract';

/**
 * A deterministic in-repo provider (spec §8.2).
 *
 * It exists so the contract can be exercised without network or spend: the same
 * request always produces the same bytes, so a test can assert on what landed
 * rather than on the fact that something did. It is a test double, not a product
 * feature — nothing registers it outside tests and the fault-injection harness.
 *
 * It produces a real PNG rather than arbitrary bytes, because the things worth
 * testing downstream — storing, thumbnailing, inlining into a preview, bundling
 * into an export — all read the file as an image.
 */

const CAPABILITY_MODELS: Record<MediaCapability, string> = {
  'text-to-image': 'fake/image',
  'image-to-image': 'fake/image-edit',
  upscale: 'fake/upscale',
  'text-to-video': 'fake/video',
};

/** How the fake can be told to fail, for the recovery and retry tests. */
export interface FakeProviderOptions {
  /** Fail every call with this error instead of producing anything. */
  failWith?: MediaError;
  /** Fail only the first N calls, so a retry can succeed. */
  failFirst?: number;
  /** Reported cost per call, so budget and cost display have something to show. */
  costUsd?: number;
  /** Await this before returning, so a test can cancel mid-flight. */
  delay?: () => Promise<void>;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, checksum]);
}

/** A solid-colour PNG. Small, valid, and identical for identical input. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.concat(Array.from({ length: width }, () => Buffer.from(rgb))),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Everything the output depends on, so the same request gives the same bytes. */
function digest(request: MediaRequest): Buffer {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.capability,
        request.prompt,
        request.model ?? '',
        request.sourceAssetIds ?? [],
        request.aspectRatio ?? '',
        request.seed ?? null,
        request.durationSeconds ?? null,
      ]),
    )
    .digest();
}

function dimensions(aspectRatio: string | undefined): { width: number; height: number } {
  const match = /^(\d+):(\d+)$/.exec(aspectRatio ?? '');
  if (!match) return { width: 16, height: 16 };
  const [, w, h] = match;
  const width = Number(w);
  const height = Number(h);
  if (width < 1 || height < 1 || width > 64 || height > 64) return { width: 16, height: 16 };
  return { width, height };
}

export function createFakeProvider(options: FakeProviderOptions = {}): MediaProvider {
  let calls = 0;

  return {
    id: 'fake',
    displayName: 'Fake provider',
    capabilities: () => [...MEDIA_CAPABILITIES],
    defaultModel: (capability) => CAPABILITY_MODELS[capability],

    async generate(request: MediaRequest, context: MediaContext): Promise<MediaResult> {
      const startedAt = Date.now();
      calls += 1;
      context.onProgress?.(`fake: queued ${request.capability}`);

      if (options.delay) await options.delay();
      if (context.signal.aborted) throw new MediaError('cancelled', 'The run was cancelled.', false);

      // `failFirst` bounds the failures so a retry can succeed; without it,
      // `failWith` fails every call.
      const shouldFail =
        options.failFirst === undefined ? options.failWith !== undefined : calls <= options.failFirst;
      if (shouldFail) {
        throw (
          options.failWith ??
          new MediaError('provider', `The fake provider failed call ${calls}.`, true)
        );
      }

      // Source-consuming capabilities read their inputs, so a test that deletes a
      // source sees the same failure the real adapter would produce on upload.
      const sources = request.sourceAssetIds ?? [];
      if (needsSource(request.capability) && sources.length === 0) {
        throw new MediaError(
          'invalid-request',
          `${request.capability} needs at least one source asset.`,
          false,
        );
      }
      for (const assetId of sources) await context.readAsset(assetId);

      const hash = digest(request);
      const model = request.model ?? CAPABILITY_MODELS[request.capability];
      const isVideo = request.capability === 'text-to-video';
      const { width, height } = dimensions(request.aspectRatio);
      const bytes = solidPng(width, height, [hash[0], hash[1], hash[2]]);
      const name = `${hash.toString('hex').slice(0, 16)}.${isVideo ? 'mp4' : 'png'}`;

      context.onProgress?.('fake: completed');
      const stored = await context.store(name, bytes);

      return {
        files: [
          {
            path: stored,
            mediaType: isVideo ? 'video/mp4' : 'image/png',
            width,
            height,
            ...(isVideo ? { durationMs: (request.durationSeconds ?? 5) * 1000 } : {}),
          },
        ],
        provenance: {
          providerId: 'fake',
          capability: request.capability,
          model,
          prompt: request.prompt,
          parameters: {
            ...(request.aspectRatio === undefined ? {} : { aspectRatio: request.aspectRatio }),
            ...(request.durationSeconds === undefined
              ? {}
              : { durationSeconds: request.durationSeconds }),
          },
          ...(request.seed === undefined ? {} : { seed: request.seed }),
          ...(options.costUsd === undefined ? {} : { costUsd: options.costUsd }),
          startedAt,
          completedAt: Date.now(),
        },
      };
    },
  };
}
