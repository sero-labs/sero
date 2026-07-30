import { describe, expect, it, vi } from 'vitest';

import { createFalMediaModelCatalog } from './fal-media-model-catalog';

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fal media model catalogue', () => {
  it('maps provider data to capability choices and shares duplicate queries', async () => {
    const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = new URL(String(input));
      const category = url.searchParams.get('category');
      return response({
        models: [
          {
            endpoint_id: `model/${category}`,
            metadata: { display_name: `Model ${category}` },
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    });
    const catalog = createFalMediaModelCatalog({
      credentials: async () => undefined,
      fetch: fetch as typeof globalThis.fetch,
    });

    const models = await catalog.list();

    expect(models['text-to-image'][0]).toEqual({
      id: 'model/text-to-image',
      label: 'Model text-to-image · model/text-to-image',
      provider: 'model',
    });
    expect(models['reference-to-image']).toEqual(models['image-to-image']);
    expect(fetch).toHaveBeenCalledTimes(5);
    const upscaleUrl = fetch.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.get('q') === 'upscale');
    expect(upscaleUrl?.searchParams.get('category')).toBe('image-to-image');
  });

  it('reads every page and sends the key only in the provider adapter', async () => {
    const fetch = vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        const url = new URL(String(input));
        const cursor = url.searchParams.get('cursor');
        if (url.searchParams.get('category') !== 'text-to-image') {
          return response({ models: [], has_more: false, next_cursor: null });
        }
        return cursor === null
          ? response({
              models: [{ endpoint_id: 'model/b', metadata: { display_name: 'B' } }],
              has_more: true,
              next_cursor: 'page-2',
            })
          : response({
              models: [{ endpoint_id: 'model/a', metadata: { display_name: 'A' } }],
              has_more: false,
              next_cursor: null,
            });
      },
    );
    const catalog = createFalMediaModelCatalog({
      credentials: async () => 'secret',
      fetch: fetch as typeof globalThis.fetch,
    });

    const models = await catalog.list();

    expect(models['text-to-image'].map((model) => model.id)).toEqual(['model/a', 'model/b']);
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Key secret' });
  });
});
