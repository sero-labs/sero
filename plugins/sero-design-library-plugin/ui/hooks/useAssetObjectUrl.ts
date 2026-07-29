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
      let mediaType = 'application/octet-stream';

      // Sequential on purpose. The parts have to arrive in order to be a file,
      // and a large clip is twenty-odd calls — asking for them all at once
      // would put the whole thing in memory twice over to save nothing.
      // eslint-disable-next-line no-await-in-loop -- ordered reads of one file
      for (let guard = 0; active; guard += 1) {
        const result = await latest.current.run('design_library_assets', {
          action: 'stream',
          itemId,
          offset,
        });
        const slice = result.details as Slice;
        if (slice.data === undefined || slice.total === undefined) return;
        if (slice.mediaType !== undefined) mediaType = slice.mediaType;

        parts.push(decode(slice.data));
        offset += slice.bytes ?? 0;
        // `bytes: 0` is how the end announces itself, and the guard is the
        // backstop for a file that somehow never reports one.
        if (offset >= slice.total || (slice.bytes ?? 0) === 0 || guard > 4096) break;
      }

      if (!active) return;
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
