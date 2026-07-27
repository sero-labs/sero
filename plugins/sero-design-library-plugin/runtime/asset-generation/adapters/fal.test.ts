/**
 * The fal.ai adapter, and a fake second provider proving the contract holds
 * for any adapter.
 */

import { ApiError, type FalClient } from '@fal-ai/client';
import { describe, expect, it, vi } from 'vitest';
import { createFalAdapter } from './fal';
import {
  assetFailure,
  type AssetGenerationContext,
  type AssetGenerationProvider,
} from '../contract';
import { AssetProviderRegistry } from '../registry';

function context(overrides: Partial<AssetGenerationContext> = {}): AssetGenerationContext {
  return {
    secret: async () => 'test-key',
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

/** A fal client double that records what the adapter asked for. */
function stubClient(subscribe: FalClient['subscribe']) {
  const calls: Array<{ endpointId: string; options: Record<string, unknown> }> = [];
  const create = (credentials: string) => {
    calls.push({ endpointId: '__credentials__', options: { credentials } });
    return {
      subscribe: ((endpointId: string, options: Record<string, unknown>) => {
        calls.push({ endpointId, options });
        return (subscribe as unknown as (id: string, o: unknown) => unknown)(endpointId, options);
      }) as unknown as FalClient['subscribe'],
    } as unknown as FalClient;
  };
  return { create, calls };
}

function imageDownload(mimeType = 'image/png') {
  return vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': mimeType },
  })) as unknown as typeof fetch;
}

describe('fal adapter', () => {
  it('reports a missing credential without calling the client', async () => {
    const client = stubClient(vi.fn() as unknown as FalClient['subscribe']);
    const adapter = createFalAdapter({ createClient: client.create });

    const result = await adapter.generate(
      { prompt: 'a soft abstract field', capability: 'illustration' },
      context({ secret: async () => null }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('not-configured');
    expect(result.retryable).toBe(false);
    expect(client.calls).toHaveLength(0);
  });

  it('subscribes to the fal endpoint with the mapped input', async () => {
    const client = stubClient((async () => ({
      data: { images: [{ url: 'https://cdn.test/a.png' }], seed: 42 },
      requestId: 'req-1',
    })) as unknown as FalClient['subscribe']);

    const adapter = createFalAdapter({ createClient: client.create, fetchImpl: imageDownload() });
    const result = await adapter.generate(
      { prompt: 'a soft abstract field', capability: 'illustration', aspectRatio: '16:9', seed: 7 },
      context(),
    );

    expect(client.calls[0].options).toEqual({ credentials: 'test-key' });
    expect(client.calls[1].endpointId).toBe('fal-ai/flux/schnell');
    expect(client.calls[1].options.input).toMatchObject({
      prompt: 'a soft abstract field',
      image_size: 'landscape_16_9',
      num_images: 1,
      seed: 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.mimeType).toBe('image/png');
    expect(result.asset.fileExtension).toBe('png');
    expect(result.asset.data).toHaveLength(3);
    expect(result.provenance.providerId).toBe('fal');
    expect(result.provenance.modelId).toBe('fal-ai/flux/schnell');
    expect(result.provenance.seed).toBe('42');
    expect(result.provenance.providerExtension).toEqual({ requestId: 'req-1' });
  });

  it('passes the cancellation signal through to the client', async () => {
    const controller = new AbortController();
    const client = stubClient((async () => ({
      data: { images: [{ url: 'https://cdn.test/a.png' }] },
      requestId: 'req-2',
    })) as unknown as FalClient['subscribe']);

    const adapter = createFalAdapter({ createClient: client.create, fetchImpl: imageDownload() });
    await adapter.generate(
      { prompt: 'x', capability: 'texture' },
      context({ signal: controller.signal }),
    );

    expect(client.calls[1].options.abortSignal).toBe(controller.signal);
  });

  it('classifies provider errors into retryable and terminal outcomes', async () => {
    const rateLimited = createFalAdapter({
      createClient: stubClient((() => {
        throw new ApiError({ message: 'slow down', status: 429, body: {} });
      }) as unknown as FalClient['subscribe']).create,
    });
    const limited = await rateLimited.generate({ prompt: 'x', capability: 'texture' }, context());
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.kind).toBe('rate-limited');
      expect(limited.retryable).toBe(true);
    }

    const unauthorised = createFalAdapter({
      createClient: stubClient((() => {
        throw new ApiError({ message: 'bad key', status: 401, body: {} });
      }) as unknown as FalClient['subscribe']).create,
    });
    const rejected = await unauthorised.generate({ prompt: 'x', capability: 'texture' }, context());
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.kind).toBe('not-configured');
      expect(rejected.retryable).toBe(false);
    }

    const empty = createFalAdapter({ createClient: stubClient(vi.fn() as never).create });
    const invalid = await empty.generate({ prompt: '   ', capability: 'texture' }, context());
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.kind).toBe('invalid-request');
  });

  it('never returns a remote URL to the caller', async () => {
    const client = stubClient((async () => ({
      data: { images: [{ url: 'https://cdn.test/a.png' }] },
      requestId: 'req-3',
    })) as unknown as FalClient['subscribe']);

    const adapter = createFalAdapter({
      createClient: client.create,
      fetchImpl: imageDownload('image/webp'),
    });
    const result = await adapter.generate({ prompt: 'x', capability: 'background' }, context());

    expect(JSON.stringify(result)).not.toContain('cdn.test');
    if (result.ok) expect(result.asset.fileExtension).toBe('webp');
  });
});

/** A second adapter with no fal.ai knowledge, run against the same contract. */
function createStubProvider(): AssetGenerationProvider {
  return {
    id: 'stub',
    capabilities: () => ['illustration'],
    async generate(request, ctx) {
      if (!request.prompt) return assetFailure('invalid-request', 'No prompt.', false);
      return {
        ok: true,
        asset: { data: new Uint8Array([7]), mimeType: 'image/png', fileExtension: 'png' },
        provenance: {
          toolId: 'design_library_generate_asset',
          providerId: 'stub',
          modelId: 'stub-1',
          prompt: request.prompt,
          parameters: { capability: request.capability },
          startedAt: ctx.now(),
          completedAt: ctx.now(),
        },
      };
    },
  };
}

describe('provider contract', () => {
  it('accepts a second adapter with no provider-specific changes', async () => {
    const registry = new AssetProviderRegistry([createStubProvider()]);
    const provider = registry.forCapability('illustration');
    expect(provider?.id).toBe('stub');

    const result = await provider!.generate({ prompt: 'x', capability: 'illustration' }, context());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provenance.providerId).toBe('stub');
  });

  it('returns nothing for a capability no adapter advertises', () => {
    const registry = new AssetProviderRegistry([createStubProvider()]);
    expect(registry.forCapability('texture')).toBeNull();
    expect(registry.ids()).toEqual(['stub']);
  });

  it('keeps the fal adapter behind the neutral capability lookup', () => {
    const registry = new AssetProviderRegistry([createFalAdapter()]);
    expect(registry.forCapability('illustration')?.id).toBe('fal');
  });
});
