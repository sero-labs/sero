import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useRef, useState } from 'react';

/**
 * A stored file as a Blob URL, read through the tool channel in slices (D4).
 *
 * The other hook hands back a `data:` URL, which is right for a thumbnail and
 * wrong for a clip: a media element cannot seek or stream one, it has to take
 * the whole string at once, and a generated video therefore produced a player
 * that rendered and would not play. A Blob URL is a real URL — the element can
 * range-request it, and the bytes are never a JavaScript string of their own.
 *
 * Nothing is cached. A clip is megabytes and the thumbnail cache is bounded by
 * count, so keeping them there would let a handful of videos hold hundreds of
 * megabytes; the URL is revoked as soon as nothing is showing it.
 */

/**
 * A ceiling on what will be held in memory to play something.
 *
 * The whole file becomes a Blob in the renderer, so without a limit one
 * enormous item could take the window down. Generated clips are a few tens of
 * megabytes; this is far above that and far below trouble.
 */
const MAX_PLAYABLE_BYTES = 128 * 1024 * 1024;

/** Enough for the ceiling above at any sane slice size, and no more. */
const MAX_SLICES = 4096;

interface Slice {
  total?: number;
  bytes?: number;
  offset?: number;
  mediaType?: string;
  data?: string;
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function useAssetObjectUrl(itemId: string | undefined): string | null {
  const tools = useAppTools();
  const [url, setUrl] = useState<string | null>(null);

  // The item is the only thing worth restarting for. Depending on the tool
  // context as well would mean a provider that hands back a fresh object each
  // render re-reads the whole clip every render — a mistake worth a thumbnail
  // elsewhere, and worth megabytes a second here.
  const latest = useRef(tools);
  useEffect(() => {
    latest.current = tools;
  });

  useEffect(() => {
    if (itemId === undefined) {
      setUrl(null);
      return;
    }

    let active = true;
    let created: string | null = null;

    const load = async () => {
      const parts: Uint8Array[] = [];
      let offset = 0;
      let total: number | null = null;
      let mediaType = 'application/octet-stream';

      // Sequential on purpose. The parts have to arrive in order to be a file,
      // and a large clip is twenty-odd calls — asking for them all at once
      // would put the whole thing in memory twice over to save nothing.
      // eslint-disable-next-line no-await-in-loop -- ordered reads of one file
      for (let guard = 0; active; guard += 1) {
        if (guard > MAX_SLICES) throw new Error('That file needed too many reads.');

        const result = await latest.current.run('design_library_assets', {
          action: 'stream',
          itemId,
          offset,
        });
        const slice = result.details as Slice;
        if (slice.data === undefined || slice.total === undefined || slice.bytes === undefined) {
          throw new Error('That file could not be read.');
        }

        // The size is settled by the first answer and never moves. A file
        // rewritten underneath a read would otherwise mix two files together
        // and hand the result to the player as though it were one.
        if (total === null) {
          total = slice.total;
          if (total > MAX_PLAYABLE_BYTES) throw new Error('That file is too large to play here.');
          if (slice.mediaType !== undefined) mediaType = slice.mediaType;
        } else if (slice.total !== total) {
          throw new Error('That file changed while it was being read.');
        }

        // Every slice has to be the one that was asked for, and has to carry
        // something: a short or misplaced read means the bytes no longer make
        // the file, and a truncated video that plays is worse than none.
        const decoded = decode(slice.data);
        if (slice.offset !== offset || decoded.byteLength !== slice.bytes || slice.bytes === 0) {
          throw new Error('That file could not be read in full.');
        }

        parts.push(decoded);
        offset += slice.bytes;
        if (offset >= total) break;
      }

      // Only a file that arrived whole is worth showing. Anything else has
      // already thrown; this is the last word on it.
      if (!active) return;
      if (total === null || offset !== total) throw new Error('That file could not be read in full.');

      created = URL.createObjectURL(new Blob(parts as BlobPart[], { type: mediaType }));
      setUrl(created);
    };

    setUrl(null);
    void load().catch(() => {
      if (active) setUrl(null);
    });

    return () => {
      active = false;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, [itemId]);

  return url;
}
