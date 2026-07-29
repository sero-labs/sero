import { open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { effectiveField } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import { itemRecordFile, resolveInsideHome } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import { readJsonFile } from '../../shared/state-io';
import { UPLOAD_CHUNK_BYTES } from '../../shared/uploads';
import { failure, image, text, type ToolResult } from './result';

/**
 * Reading the files an item owns.
 *
 * Split from the tool surface because it is the half with the rules: where a
 * file is allowed to be, how a still differs from a clip, and what a caller is
 * told when the file named by a record is not the file on disk.
 */

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * The real path of a file inside the storage, or why there isn't one.
 *
 * A lexical check cannot see a symlink, and every reader here builds its path
 * from a record rather than from the caller — which is not the same as the file
 * on disk being where the record says. Resolving and re-checking is what stops
 * a link inside the plugin's storage becoming a read of anything on the
 * machine.
 *
 * Both sides are resolved, not just the file: on macOS the app directory itself
 * usually sits under a symlinked prefix (`/var` → `/private/var`), so comparing
 * a real path against the unresolved home would refuse every legitimate read.
 *
 * `missing` and `outside` are kept apart because they are different news. A
 * file that is simply not there should say so; reporting it as a refused path
 * is both wrong and the more alarming of the two.
 */
export type Located = { path: string } | { error: 'missing' | 'outside' };

export async function realPathInsideHome(
  paths: DesignLibraryPaths,
  relative: string,
): Promise<Located> {
  const resolved = resolveInsideHome(paths, relative);
  if (!resolved) return { error: 'outside' };

  const [real, realHome] = await Promise.all([
    realpath(resolved).catch(() => null),
    realpath(paths.home).catch(() => null),
  ]);
  // A path that cannot be resolved at all is one that is not there — including
  // a link pointing at nothing.
  if (real === null) return { error: 'missing' };
  if (realHome === null || !isInside(realHome, real)) return { error: 'outside' };
  return { path: real };
}

export function locationError(located: { error: 'missing' | 'outside' }, what: string): ToolResult {
  return failure(
    located.error === 'missing'
      ? `${what} is missing.`
      : 'Refusing to read a path outside the Design Library directory.',
  );
}


const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function mediaTypeFor(filePath: string): string {
  return MEDIA_TYPES[path.extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export async function readItemAsset(
  paths: DesignLibraryPaths,
  itemId: string,
  which: 'preview' | 'original',
): Promise<ToolResult> {
  // The record names its own files, so the caller never supplies a path.
  const record = await readJsonFile<ItemRecord>(itemRecordFile(paths, itemId));
  if (!record) return failure(`No Library item ${itemId}.`);

  const fileName = which === 'preview' ? record.asset.previewFile : record.asset.originalFile;
  const located = await realPathInsideHome(paths, `items/${itemId}/${fileName}`);
  if ('error' in located) return locationError(located, `The ${which} for ${itemId}`);

  const bytes = await readFile(located.path).catch(() => null);
  if (!bytes) return failure(`The ${which} for ${itemId} is missing.`);

  const title = effectiveField(record.profile, 'title');
  return image(bytes.toString('base64'), mediaTypeFor(located.path), `${title} (${which})`);
}

/**
 * One slice of an item's original file (D4).
 *
 * Video needs this and images do not. A still comes back whole as a base64
 * image block, which is fine at thumbnail size; a clip is megabytes, and a
 * `data:` URL of it cannot be seeked or streamed — the media element has to
 * take the entire string at once, and a generated clip therefore rendered a
 * player that would not play. Read in slices, the renderer can assemble a Blob
 * and hand the element a real, seekable URL.
 *
 * The slice rides in `details` rather than as an image block: it is bytes of a
 * video, and an image block holding video is the mislabelling that started
 * this. `total` comes back on every call so the caller knows when to stop
 * without a second round trip.
 */
export async function streamItemAsset(
  paths: DesignLibraryPaths,
  itemId: string,
  offset: number,
): Promise<ToolResult> {
  const record = await readJsonFile<ItemRecord>(itemRecordFile(paths, itemId));
  if (!record) return failure(`No Library item ${itemId}.`);

  const located = await realPathInsideHome(paths, `items/${itemId}/${record.asset.originalFile}`);
  if ('error' in located) return locationError(located, `The original for ${itemId}`);

  const handle = await open(located.path, 'r').catch(() => null);
  if (!handle) return failure(`The original for ${itemId} is missing.`);

  try {
    const stats = await handle.stat();
    const { size } = stats;
    // A start past the end is not an error: it is how a caller that has read
    // everything finds out, and how a file that shrank underneath one stops.
    const start = Math.max(0, Math.min(offset, size));
    const buffer = Buffer.alloc(Math.min(UPLOAD_CHUNK_BYTES, size - start));
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, start);

    return text(`Bytes ${start}–${start + bytesRead} of ${size}.`, {
      ok: true,
      total: size,
      offset: start,
      bytes: bytesRead,
      mediaType: record.asset.mediaType,
      // Which file these bytes came from, not just how big it was. The file is
      // reopened for every slice, so a caller stitching them together has no
      // other way to know they all came from the same one — and a replacement
      // of identical size satisfies every other check while producing a clip
      // made of two different files. The caller refuses a slice without one, so
      // dropping it here fails the read rather than losing the check quietly.
      identity: `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}`,
      data: buffer.subarray(0, bytesRead).toString('base64'),
    });
  } finally {
    await handle.close();
  }
}
