/**
 * Everything the page sends to the runtime.
 *
 * Two channels, and only two. Intent goes through `request`, which is how every
 * change is made; bytes go through `stage`, which the runtime reads back in
 * name order and then deletes. Ids for anything that creates a record are
 * allocated here rather than by the handler: the request log is applied
 * at-least-once, and an id chosen on the other side would make a replay produce
 * a second character — or a second paid-for clip.
 */

import type { AppTools } from '@sero-ai/app-runtime';

import type { SpriteRequestBody } from '../../shared/state';

export const SPRITE_TOOL = 'design_library_sprites';

/** Must match `STAGING_CHUNK_BYTES` in `sprite-studio/runtime/staging.ts`. */
export const STAGE_CHUNK_BYTES = 512 * 1024;

/**
 * An id that is also a safe path segment, because it becomes one.
 *
 * `crypto.randomUUID` is available in every renderer this runs in and its
 * output is already within the safe-id class.
 */
export function newSpriteId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * A staged file's name.
 *
 * Staged files are read back in name order and that order *is* the animation,
 * so the numbers are padded — `10` sorting before `2` would silently reorder a
 * sequence rather than fail.
 */
export function frameName(index: number): string {
  return String(index).padStart(3, '0');
}

/** One file's bytes, cut to what a single `stage` call will carry. */
export function chunkBytes(bytes: Uint8Array, chunkSize = STAGE_CHUNK_BYTES): Uint8Array[] {
  if (bytes.byteLength === 0) return [bytes];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In blocks, because `String.fromCharCode(...bytes)` on a whole frame blows
  // the argument limit.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Append one intent. The runtime is the only writer; this only asks. */
export async function sendRequest(tools: AppTools, body: SpriteRequestBody): Promise<void> {
  await tools.run(SPRITE_TOOL, { action: 'request', body });
}

/** Push one file's bytes under a staging key, in order. */
export async function stageFile(
  tools: AppTools,
  key: string,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const chunks = chunkBytes(bytes);
  for (const [index, chunk] of chunks.entries()) {
    // Sequential by necessity: the runtime stores chunks per index, and sending
    // a whole animation's frames at once puts every byte in flight together.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await tools.run(SPRITE_TOOL, {
      action: 'stage',
      key,
      name,
      index,
      data: toBase64(chunk),
    });
  }
}

/**
 * Whatever the user chose, as a PNG.
 *
 * The runtime has no codecs — that is why it is handed frames rather than a
 * clip — and the same is true of a picture. The page does have them: a canvas
 * decodes PNG, JPEG and WebP and re-encodes losslessly, so a JPEG reference
 * works because it stops being a JPEG here rather than because something
 * downstream learned to read one.
 *
 * Nothing is resized. The whole point of ingestion is to measure the artwork's
 * real size, and a picture that arrived a few pixels smaller would take the
 * grid with it.
 */
export async function toPngBytes(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('This renderer has no 2D canvas, so the picture cannot be read.');
    // Off, or the browser smooths the pixels while drawing them and every hard
    // edge the art grid is measured from goes soft.
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob === null) throw new Error('The picture could not be converted.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

/** Read a plugin file back, since the page has no filesystem of its own. */
export async function readAsset(tools: AppTools, path: string): Promise<Blob | null> {
  const result = await tools.run(SPRITE_TOOL, { action: 'asset', path });
  const block = result.content.find((entry) => entry.type === 'image');
  if (block === undefined) return null;
  const binary = atob(block.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: block.mimeType });
}
