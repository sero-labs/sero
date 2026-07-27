/**
 * Bounded image cache.
 *
 * Previews arrive as image content blocks from a tool call. Thousands of
 * Library items stay practical because only the most recently used previews
 * are held as data URLs, and nothing binary ever enters reactive state.
 */

import { useEffect, useState } from 'react';
import type { ToolResult } from '../runtime';

const MAX_CACHED_PREVIEWS = 120;
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, dataUrl: string): void {
  cache.delete(key);
  cache.set(key, dataUrl);
  while (cache.size > MAX_CACHED_PREVIEWS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearImageCache(): void {
  cache.clear();
  inFlight.clear();
}

export type ImageLoader = (params: Record<string, unknown>) => Promise<ToolResult>;

async function load(key: string, loader: ImageLoader, params: Record<string, unknown>): Promise<string | null> {
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const result = await loader(params);
    const block = result.content?.find((entry) => entry.type === 'image' && entry.data);
    if (!block?.data) return null;
    const dataUrl = `data:${block.mimeType ?? 'image/png'};base64,${block.data}`;
    remember(key, dataUrl);
    return dataUrl;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

/** Resolve a Library item's preview as a data URL. */
export function useItemImage(itemId: string | undefined, loader: ImageLoader): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(
    itemId ? cache.get(`item:${itemId}`) ?? null : null,
  );

  useEffect(() => {
    if (!itemId) {
      setDataUrl(null);
      return;
    }
    let active = true;
    void load(`item:${itemId}`, loader, { action: 'read_preview', itemId }).then((value) => {
      if (active) setDataUrl(value);
    });
    return () => {
      active = false;
    };
  }, [itemId, loader]);

  return dataUrl;
}

/** Resolve a Design-owned generated asset as a data URL. */
export function useAssetImage(
  designId: string | undefined,
  assetId: string | undefined,
  loader: ImageLoader,
): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!designId || !assetId) {
      setDataUrl(null);
      return;
    }
    let active = true;
    void load(`asset:${designId}:${assetId}`, loader, { action: 'read', designId, assetId })
      .then((value) => {
        if (active) setDataUrl(value);
      });
    return () => {
      active = false;
    };
  }, [designId, assetId, loader]);

  return dataUrl;
}
