import { describe, expect, it, vi } from 'vitest';

import { createFalMediaModelCatalog } from './fal-media-model-catalog';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fal media model catalogue', () => {
  it('maps one anonymous working set to provider-neutral capability choices', async () => {
    const fetch = vi.fn(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        _init?: Parameters<typeof globalThis.fetch>[1],
      ) =>
        response({
          models: [
            {
              endpoint_id: 'fal-ai/flux/dev',
              metadata: { display_name: 'FLUX Dev', category: 'text-to-image' },
            },
            {
              endpoint_id: 'partner/editor',
              metadata: { display_name: 'Editor', category: 'image-to-image' },
            },
            {
              endpoint_id: 'partner/upscaler',
              metadata: { display_name: 'Photo Upscale', category: 'image-to-image' },
            },
            {
              endpoint_id: 'partner/video',
              metadata: { display_name: 'Video', category: 'text-to-video' },
            },
            {
              endpoint_id: 'partner/animate',
              metadata: { display_name: 'Animate', category: 'image-to-video' },
            },
          ],
        }),
    );
    const catalog = createFalMediaModelCatalog({ fetch: fetch as typeof globalThis.fetch });

    const models = await catalog.list();

    expect(models['text-to-image'][0]).toEqual({
      id: 'fal-ai/flux/dev',
      label: 'FLUX Dev · fal-ai/flux/dev',
      provider: 'fal-ai',
    });
    expect(models['reference-to-image']).toEqual(models['image-to-image']);
    expect(models.upscale.map((model) => model.id)).toEqual(['partner/upscaler']);
    expect(models['text-to-video'][0]?.id).toBe('partner/video');
    expect(models['image-to-video'][0]?.id).toBe('partner/animate');
    expect(fetch).toHaveBeenCalledTimes(1);

    const [input, init] = fetch.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('status')).toBe('active');
    expect(init?.headers).toBeUndefined();
  });

  it('caches successful results until an explicit refresh', async () => {
    const fetch = vi.fn(async () => response({ models: [] }));
    const catalog = createFalMediaModelCatalog({ fetch: fetch as typeof globalThis.fetch });

    await catalog.list();
    await catalog.list();
    await catalog.list({ refresh: true });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the cached result when a refresh fails', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          models: [
            {
              endpoint_id: 'provider/model',
              metadata: { display_name: 'Model', category: 'text-to-image' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({}, 429));
    const catalog = createFalMediaModelCatalog({ fetch: fetch as typeof globalThis.fetch });

    const cached = await catalog.list();
    await expect(catalog.list({ refresh: true })).rejects.toThrow('returned 429');
    expect(await catalog.list()).toEqual(cached);
  });
});
