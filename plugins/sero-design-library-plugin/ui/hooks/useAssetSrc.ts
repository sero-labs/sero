import type { AppToolResult } from '@sero-ai/common';
import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useRef, useState } from 'react';
import { BoundedImageCache } from '../lib/image-cache';

/**
 * Stored images, fetched through the asset tool and cached.
 *
 * The UI has no filesystem access, so every thumbnail is a base64 payload from
 * a tool call. That makes caching load-bearing rather than an optimisation: a
 * scrolling grid would otherwise re-fetch and re-decode the same images
 * endlessly. The cache is bounded because the payloads are large — an
 * unbounded one would hold every image the user has ever scrolled past.
 *
 * Library items, Design assets and Gallery previews share the cache and the
 * in-flight map. They are the same problem — bytes only a tool call can reach —
 * and one cache with one bound is the only way the bound means anything.
 */

const MAX_CACHED = 120;

const cache = new BoundedImageCache(MAX_CACHED);
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, dataUrl: string): void {
  cache.set(key, dataUrl);
}

function toDataUrl(result: AppToolResult): string | null {
  const block = result.content.find((entry) => entry.type === 'image');
  return block === undefined ? null : `data:${block.mimeType};base64,${block.data}`;
}

/**
 * One image, by cache key, from one `design_library_assets` call.
 *
 * `key` is the dependency rather than `params`, because the key is built from
 * exactly the values the params are: depending on the object would re-run the
 * effect every render for an identical request. The params travel through a ref
 * so the effect reads the current ones without having to list them.
 *
 * The ref is written in an effect rather than during render, because React may
 * replay or discard a render — and a discarded one would leave the ref holding
 * params no committed render ever had. Effects run in declaration order, so the
 * write below always lands before the fetch reads it.
 */
function useToolImage(
  key: string,
  params: Record<string, unknown> | null,
  toolName = 'design_library_assets',
): string | null {
  const tools = useAppTools();
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  });

  const [src, setSrc] = useState<string | null>(() => (key === '' ? null : cache.get(key) ?? null));

  useEffect(() => {
    if (key === '') {
      setSrc(null);
      return;
    }

    const cached = cache.get(key);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }

    const request = latest.current;
    if (request === null) {
      setSrc(null);
      return;
    }

    let active = true;
    // Two tiles asking for the same image share one tool call.
    const pending =
      inFlight.get(key) ??
      tools
        .run(toolName, request)
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
  }, [key, toolName, tools]);

  return src;
}

export function useGalleryPreviewSrc(
  familyId: string,
  versionId: string | undefined,
): string | null {
  return useToolImage(
    versionId === undefined ? '' : `gallery:${familyId}:${versionId}`,
    versionId === undefined ? null : { action: 'preview', familyId, versionId },
    'design_library_gallery',
  );
}

export type AssetVariant = 'preview' | 'original';

export function useAssetSrc(itemId: string | undefined, variant: AssetVariant = 'preview'): string | null {
  return useToolImage(
    itemId === undefined ? '' : `${variant}:${itemId}`,
    itemId === undefined ? null : { action: variant, itemId },
  );
}

/** What a Design asset tile paints: the artwork, or a video's still frame. */
export type DesignAssetVariant = 'media' | 'poster';

/**
 * One Design asset's bytes.
 *
 * Keyed on the attempt as well as the asset, because a retry deliberately keeps
 * the asset's id and its reference — so a key built from the id alone would go
 * on showing the failed attempt's cached artwork after a successful retry.
 */
export function useDesignAssetSrc(
  designId: string,
  assetId: string | undefined,
  attemptId: string | undefined,
  which: DesignAssetVariant = 'media',
): string | null {
  const ready = assetId !== undefined && attemptId !== undefined;
  return useToolImage(
    ready ? `${which}:${designId}:${assetId}:${attemptId}` : '',
    ready ? { action: 'design-asset', designId, assetId, which } : null,
  );
}

/** Called after a reanalysis or reimport that could change the stored bytes. */
export function forgetAsset(itemId: string): void {
  cache.delete(`preview:${itemId}`);
  cache.delete(`original:${itemId}`);
}
