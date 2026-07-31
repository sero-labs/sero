import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useRef, useState } from 'react';

import { SPRITE_TOOL } from '../lib/requests';

/**
 * Stored pictures and stored cells, read through the tool channel.
 *
 * The page has no filesystem, so every sprite on screen is a base64 payload
 * from a tool call. That makes caching load-bearing rather than an optimisation:
 * a frame strip paints ten frames, the stage paints one of them again and the
 * editor's onion skin paints two more, all from the same files.
 *
 * The cache is bounded because sprites are small but numerous — an animation is
 * ten of them and a character has five animations.
 */

const MAX_CACHED = 240;

const images = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(path: string, dataUrl: string): void {
  images.set(path, dataUrl);
  while (images.size > MAX_CACHED) {
    const oldest = images.keys().next();
    if (oldest.done) return;
    images.delete(oldest.value);
  }
}

/**
 * One stored picture, by its path relative to the app state directory.
 *
 * The path alone is not enough to key it. A hand edit rewrites a frame in
 * place, and capping the palette re-quantises the base pose in place, so a
 * cache keyed on the path would go on showing the picture from before the
 * change. `version` is the owning record's `updatedAt`, which moves on every
 * write — so the cache holds until the thing it is a picture of has changed.
 */
export function useSpriteAsset(path: string | undefined, version?: number): string | null {
  const tools = useAppTools();
  // The path travels through the ref so the effect can read it without listing
  // it: the key is built from exactly the values the request is, and depending
  // on both would only re-run the effect for an identical call.
  const latest = useRef({ tools, path });
  useEffect(() => {
    latest.current = { tools, path };
  });

  const key = path === undefined ? '' : `${path}@${version ?? ''}`;
  const [src, setSrc] = useState<string | null>(() => (key === '' ? null : (images.get(key) ?? null)));

  useEffect(() => {
    if (key === '') {
      setSrc(null);
      return;
    }
    const cached = images.get(key);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }

    let active = true;
    // Two tiles asking for the same frame share one tool call.
    const pending =
      inFlight.get(key) ??
      latest.current.tools
        .run(SPRITE_TOOL, { action: 'asset', path: latest.current.path })
        .then((result) => {
          const block = result.content.find((entry) => entry.type === 'image');
          if (block === undefined) return null;
          const dataUrl = `data:${block.mimeType};base64,${block.data}`;
          remember(key, dataUrl);
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
  }, [key]);

  return src;
}

export interface FrameCells {
  cols: number;
  rows: number;
  /** One palette index per cell. */
  cells: number[];
  palette: string[];
}

function toCells(details: Record<string, unknown> | undefined | null): FrameCells | null {
  if (details === undefined || details === null) return null;
  const { cols, rows, cells, palette } = details;
  if (typeof cols !== 'number' || typeof rows !== 'number') return null;
  if (!Array.isArray(cells) || !Array.isArray(palette)) return null;
  return {
    cols,
    rows,
    cells: cells.map((cell) => (typeof cell === 'number' ? cell : -1)),
    palette: palette.map(String),
  };
}

/**
 * One frame as palette indexes, for the editor.
 *
 * The editor paints indexes rather than colours, so it asks for the frame in
 * the form it is stored in rather than decoding a picture and guessing which
 * palette entry each pixel came from.
 */
export function useFrameCells(path: string | undefined): FrameCells | null {
  const tools = useAppTools();
  const latest = useRef(tools);
  useEffect(() => {
    latest.current = tools;
  });

  const key = path ?? '';
  const [frame, setFrame] = useState<FrameCells | null>(null);

  useEffect(() => {
    if (key === '') {
      setFrame(null);
      return;
    }
    let active = true;
    setFrame(null);
    void latest.current
      .run(SPRITE_TOOL, { action: 'frame', path: key })
      .then((result) => {
        if (active) setFrame(toCells(result.details));
      })
      .catch(() => {
        if (active) setFrame(null);
      });
    return () => {
      active = false;
    };
  }, [key]);

  return frame;
}
