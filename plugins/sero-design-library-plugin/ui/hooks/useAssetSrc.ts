import type { AppToolResult } from '@sero-ai/common';
import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useState } from 'react';

/**
 * Item images, fetched through the asset tool and cached.
 *
 * The UI has no filesystem access, so every thumbnail is a base64 payload from
 * a tool call. That makes caching load-bearing rather than an optimisation: a
 * scrolling grid would otherwise re-fetch and re-decode the same images
 * endlessly. The cache is bounded because the payloads are large — an
 * unbounded one would hold every image the user has ever scrolled past.
 */

const MAX_CACHED = 120;

/** Insertion-ordered, so the oldest key is the first one `keys()` yields. */
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, dataUrl: string): void {
  cache.set(key, dataUrl);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
}

function toDataUrl(result: AppToolResult): string | null {
  const block = result.content.find((entry) => entry.type === 'image');
  return block === undefined ? null : `data:${block.mimeType};base64,${block.data}`;
}

export type AssetVariant = 'preview' | 'original';

export function useAssetSrc(itemId: string | undefined, variant: AssetVariant = 'preview'): string | null {
  const tools = useAppTools();
  const key = itemId === undefined ? '' : `${variant}:${itemId}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    if (itemId === undefined) {
      setSrc(null);
      return;
    }

    const cached = cache.get(key);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }

    let active = true;
    // Two cards asking for the same image share one tool call.
    const pending =
      inFlight.get(key) ??
      tools
        .run('design_library_assets', { action: variant, itemId })
        .then((result) => {
          const dataUrl = toDataUrl(result);
          if (dataUrl !== null) remember(key, dataUrl);
          return dataUrl;
        })
        .catch(() => null)
        .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);

    setSrc(null);
    void pending.then((dataUrl) => {
      if (active) setSrc(dataUrl);
    });

    return () => {
      active = false;
    };
  }, [itemId, key, tools, variant]);

  return src;
}

/** Called after a reanalysis or reimport that could change the stored bytes. */
export function forgetAsset(itemId: string): void {
  cache.delete(`preview:${itemId}`);
  cache.delete(`original:${itemId}`);
}
