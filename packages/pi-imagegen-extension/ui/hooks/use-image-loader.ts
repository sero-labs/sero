/**
 * Lazy image loader — reads image files via IPC and caches data URIs in memory.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface SeroImagegenBridge {
  readImage(filePath: string): Promise<string>;
}

function getBridge(): SeroImagegenBridge | null {
  return (window as any).sero?.imagegen ?? null;
}

const imageCache = new Map<string, string>();

/** Load a single image by file path, returning a data URI. */
export function useImageLoader(filePath: string | undefined): {
  dataUri: string | null;
  loading: boolean;
} {
  const [dataUri, setDataUri] = useState<string | null>(
    filePath ? imageCache.get(filePath) ?? null : null,
  );
  const [loading, setLoading] = useState(!dataUri && !!filePath);

  useEffect(() => {
    if (!filePath) return;

    const cached = imageCache.get(filePath);
    if (cached) {
      setDataUri(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      return;
    }

    bridge.readImage(filePath).then((uri) => {
      if (cancelled) return;
      imageCache.set(filePath, uri);
      setDataUri(uri);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filePath]);

  return { dataUri, loading };
}

/** Batch-load multiple images. Returns a map of filePath → dataUri. */
export function useImageBatchLoader(filePaths: string[]): {
  images: Map<string, string>;
  loading: boolean;
} {
  const [images, setImages] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const fp of filePaths) {
      const cached = imageCache.get(fp);
      if (cached) initial.set(fp, cached);
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const keyRef = useRef('');

  const load = useCallback(async (paths: string[]) => {
    const bridge = getBridge();
    if (!bridge || paths.length === 0) return;

    const missing = paths.filter((p) => !imageCache.has(p));
    if (missing.length === 0) {
      const result = new Map<string, string>();
      for (const p of paths) result.set(p, imageCache.get(p)!);
      setImages(result);
      return;
    }

    setLoading(true);

    const results = await Promise.allSettled(
      missing.map(async (fp) => {
        const uri = await bridge.readImage(fp);
        imageCache.set(fp, uri);
        return [fp, uri] as const;
      }),
    );

    const newMap = new Map<string, string>();
    for (const p of paths) {
      const cached = imageCache.get(p);
      if (cached) newMap.set(p, cached);
    }
    for (const r of results) {
      if (r.status === 'fulfilled') {
        newMap.set(r.value[0], r.value[1]);
      }
    }

    setImages(newMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    const key = filePaths.join('|');
    if (key === keyRef.current) return;
    keyRef.current = key;
    load(filePaths);
  }, [filePaths, load]);

  return { images, loading };
}
