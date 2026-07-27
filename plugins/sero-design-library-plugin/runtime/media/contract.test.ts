import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MEDIA_CAPABILITIES } from '../../shared/media';
import type { MediaProvider, MediaSourceAsset } from './contract';
import { MediaError } from './contract';
import { executeMedia } from './execute';
import { createFalTransport, tinyPng } from './fal-transport';
import { createFalProvider } from './providers/fal';
import { createFakeProvider } from './providers/fake';

/**
 * The contract every provider has to satisfy (spec §8.1–8.2).
 *
 * Both adapters run it. The fal adapter runs against a stubbed transport rather
 * than a stubbed provider, so its own mapping code executes — the point of a
 * contract test is to catch an adapter that answers the interface while getting
 * the wire wrong, and a stubbed provider cannot see that.
 */

const SOURCE = 'source-asset';

function sourceAsset(): MediaSourceAsset {
  return { path: '/tmp/source.png', bytes: tinyPng(), mediaType: 'image/png' };
}

interface Subject {
  name: string;
  create(): MediaProvider;
}

const SUBJECTS: Subject[] = [
  { name: 'fake', create: () => createFakeProvider({ costUsd: 0.01 }) },
  {
    name: 'fal',
    create: () =>
      createFalProvider({
        credentials: () => 'test-key',
        fetch: createFalTransport().fetch,
      }),
  },
];

describe.each(SUBJECTS)('$name provider', ({ create }) => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'design-library-media-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const run = (provider: MediaProvider, request: Parameters<MediaProvider['generate']>[0]) =>
    executeMedia(provider, request, {
      directory,
      signal: new AbortController().signal,
      readAsset: async () => sourceAsset(),
    });

  it('declares every capability and a default model for each', () => {
    const provider = create();
    expect(provider.capabilities().toSorted()).toEqual([...MEDIA_CAPABILITIES].toSorted());
    for (const capability of MEDIA_CAPABILITIES) {
      expect(provider.defaultModel(capability)).not.toBe('');
    }
  });

  it('stores the produced file locally and returns no remote url', async () => {
    const attempt = await run(create(), { capability: 'text-to-image', prompt: 'a quiet hero' });

    expect(attempt.outcome).toBe('ready');
    expect(attempt.file).toBeDefined();
    // Every field that leaves the adapter is checked for a URL: the whole
    // isolation story depends on nothing remote surviving this boundary.
    expect(JSON.stringify(attempt)).not.toMatch(/https?:\/\//);

    const stored = await readFile(path.join(directory, attempt.file as string));
    expect(stored.byteLength).toBeGreaterThan(0);
  });

  it('records provenance naming the capability, model and prompt', async () => {
    const attempt = await run(create(), { capability: 'text-to-image', prompt: 'a quiet hero' });

    expect(attempt.provenance?.capability).toBe('text-to-image');
    expect(attempt.provenance?.prompt).toBe('a quiet hero');
    expect(attempt.provenance?.model).not.toBe('');
    expect(attempt.provenance?.startedAt).toBeGreaterThan(0);
    expect(attempt.provenance?.completedAt).toBeGreaterThanOrEqual(
      attempt.provenance?.startedAt ?? 0,
    );
  });

  it('refuses a source-consuming capability with no source', async () => {
    const attempt = await run(create(), { capability: 'upscale', prompt: '' });

    expect(attempt.outcome).toBe('failed');
    expect(attempt.error?.code).toBe('invalid-request');
    // A request that is wrong will be wrong next time too.
    expect(attempt.error?.retryable).toBe(false);
  });

  it('reads its sources for image-to-image', async () => {
    const read: string[] = [];
    const attempt = await executeMedia(
      create(),
      { capability: 'image-to-image', prompt: 'warmer', sourceAssetIds: [SOURCE] },
      {
        directory,
        signal: new AbortController().signal,
        readAsset: async (assetId) => {
          read.push(assetId);
          return sourceAsset();
        },
      },
    );

    expect(read).toEqual([SOURCE]);
    expect(attempt.outcome).toBe('ready');
  });

  it('reports cancellation as a non-retryable failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const attempt = await executeMedia(
      create(),
      { capability: 'text-to-image', prompt: 'a quiet hero' },
      { directory, signal: controller.signal, readAsset: async () => sourceAsset() },
    );

    expect(attempt.outcome).toBe('failed');
    expect(attempt.error?.code).toBe('cancelled');
    expect(attempt.error?.retryable).toBe(false);
  });

  it('produces the same bytes for the same request', async () => {
    const provider = create();
    const first = await run(provider, { capability: 'text-to-image', prompt: 'stable' });
    const second = await run(provider, { capability: 'text-to-image', prompt: 'stable' });

    const read = async (attempt: typeof first) =>
      readFile(path.join(directory, attempt.file as string));
    expect(await read(first)).toEqual(await read(second));
    // The file names differ — each attempt owns its own — but the content does
    // not, which is what makes a snapshot comparison meaningful.
    expect(first.file).not.toBe(second.file);
  });
});

describe('fal adapter specifics', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'design-library-fal-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const runWith = (transport: ReturnType<typeof createFalTransport>) =>
    executeMedia(
      createFalProvider({ credentials: () => 'test-key', fetch: transport.fetch }),
      { capability: 'text-to-image', prompt: 'a quiet hero', aspectRatio: '16:9' },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

  it('fails without a key, and does not call the provider to find out', async () => {
    const transport = createFalTransport();
    const attempt = await executeMedia(
      createFalProvider({ credentials: () => undefined, fetch: transport.fetch }),
      { capability: 'text-to-image', prompt: 'x' },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

    expect(attempt.error?.code).toBe('auth');
    expect(attempt.error?.retryable).toBe(false);
    expect(transport.calls).toEqual([]);
  });

  it.each([
    { status: 401, code: 'auth', retryable: false },
    { status: 429, code: 'rate-limit', retryable: true },
    { status: 400, code: 'invalid-request', retryable: false },
    { status: 500, code: 'provider', retryable: true },
  ])(
    'maps HTTP $status to $code (retryable: $retryable)',
    async ({ status, code, retryable }) => {
      const attempt = await runWith(createFalTransport({ failStatus: status }));

      expect(attempt.error?.code).toBe(code);
      // The tray offers a retry button on the strength of this flag, so a wrong
      // answer here turns one wasted call into as many as the user will click.
      expect(attempt.error?.retryable).toBe(retryable);
    },
    // 429 and 5xx are retried inside the client with backoff before the error
    // surfaces — four attempts, so the default 5s is not enough. The wait is the
    // shipped behaviour, not a slow test.
    20_000,
  );

  it('maps an aspect ratio onto the provider image size', async () => {
    const transport = createFalTransport();
    await runWith(transport);

    const submit = transport.calls.find((call) => call.url.startsWith('https://queue.fal.run/'));
    expect(submit?.body).toMatchObject({ prompt: 'a quiet hero', image_size: 'landscape_16_9' });
  });

  it('fails a payload it cannot read rather than storing an empty asset', async () => {
    const attempt = await runWith(createFalTransport({ result: { note: 'nothing here' } }));

    expect(attempt.outcome).toBe('failed');
    expect(attempt.error?.message).toMatch(/no usable output/i);
  });

  it('uploads a local source before generating from it', async () => {
    const transport = createFalTransport();
    await executeMedia(
      createFalProvider({ credentials: () => 'test-key', fetch: transport.fetch }),
      { capability: 'image-to-image', prompt: 'warmer', sourceAssetIds: [SOURCE] },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

    expect(transport.calls.some((call) => call.url.includes('/storage/upload/initiate'))).toBe(true);
    const submit = transport.calls.find((call) => call.url.startsWith('https://queue.fal.run/'));
    expect(submit?.body).toMatchObject({ image_url: 'https://fal.media/src.png' });
  });
});

describe('executeMedia', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'design-library-exec-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('refuses a provider that returns a path it never stored', async () => {
    const rogue: MediaProvider = {
      id: 'rogue',
      displayName: 'Rogue',
      capabilities: () => ['text-to-image'],
      defaultModel: () => 'rogue/model',
      generate: async () => ({
        files: [{ path: '/etc/passwd', mediaType: 'image/png' }],
        provenance: {
          providerId: 'rogue',
          capability: 'text-to-image',
          model: 'rogue/model',
          prompt: '',
          parameters: {},
          startedAt: 0,
          completedAt: 0,
        },
      }),
    };

    const attempt = await executeMedia(
      rogue,
      { capability: 'text-to-image', prompt: 'x' },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

    expect(attempt.outcome).toBe('failed');
    expect(attempt.error?.message).toMatch(/never stored locally/i);
  });

  it('turns an unexpected throw into a failed attempt rather than propagating', async () => {
    const broken: MediaProvider = {
      id: 'broken',
      displayName: 'Broken',
      capabilities: () => ['text-to-image'],
      defaultModel: () => 'broken/model',
      generate: () => {
        throw new TypeError('undefined is not a function');
      },
    };

    const attempt = await executeMedia(
      broken,
      { capability: 'text-to-image', prompt: 'x' },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

    // A variant survives a provider failure only if the failure arrives as data.
    expect(attempt.outcome).toBe('failed');
    expect(attempt.error?.message).toMatch(/undefined is not a function/);
  });

  it('keeps a MediaError thrown by a provider intact', async () => {
    const provider = createFakeProvider({
      failWith: new MediaError('rate-limit', 'Slow down.', true),
    });
    const attempt = await executeMedia(
      provider,
      { capability: 'text-to-image', prompt: 'x' },
      { directory, signal: new AbortController().signal, readAsset: async () => sourceAsset() },
    );

    expect(attempt.error).toEqual({ code: 'rate-limit', message: 'Slow down.', retryable: true });
  });
});
