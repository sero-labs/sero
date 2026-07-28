import type { AppTools } from '@sero-ai/app-runtime';

import { captureFrames } from './video-frames';

/**
 * Sending captured frames back to the runtime (D4).
 *
 * The same chunked upload every import uses, addressed to a record that already
 * exists rather than to a new one: the clip is already stored, and what is
 * missing is something to look at.
 */

/** Must match `UPLOAD_CHUNK_BYTES` in shared/uploads.ts. */
const CHUNK_BYTES = 512 * 1024;

export type FramesTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'asset'; designId: string; assetId: string };

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function sendChunks(
  tools: AppTools,
  uploadId: string,
  role: 'preview' | 'frames',
  bytes: Uint8Array,
): Promise<void> {
  for (let index = 0; index * CHUNK_BYTES < bytes.length; index += 1) {
    const slice = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    // Sequential by necessity, as the import path is: the runtime stores chunks
    // per index and sending them all at once puts the whole file in flight.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await tools.run('design_library_assets', {
      action: 'chunk',
      uploadId,
      role,
      index,
      data: toBase64(slice),
    });
  }
}

function chunkCount(byteLength: number): number {
  return Math.ceil(byteLength / CHUNK_BYTES);
}

/** Read the stored clip back through the tool, since the UI has no filesystem. */
async function readVideo(tools: AppTools, target: FramesTarget): Promise<Blob | null> {
  const result = await tools.run(
    'design_library_assets',
    target.kind === 'item'
      ? { action: 'original', itemId: target.itemId }
      : { action: 'design-asset', designId: target.designId, assetId: target.assetId, which: 'media' },
  );

  const block = result.content.find((entry) => entry.type === 'image');
  if (block === undefined) return null;
  const binary = atob(block.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: block.mimeType });
}

export interface FramesResult {
  ok: boolean;
  error?: string;
}

/**
 * Capture a clip's poster and filmstrip and attach them.
 *
 * A failure here is not fatal to anything: the record keeps `awaitingFrames`
 * and the next open tries again. It is reported so a clip that can never be
 * decoded does not look like one that is merely slow.
 */
export async function captureAndAttach(
  tools: AppTools,
  target: FramesTarget,
): Promise<FramesResult> {
  const video = await readVideo(tools, target);
  if (video === null) return { ok: false, error: 'The stored video could not be read.' };

  const captured = await captureFrames(video).catch((error: unknown) => {
    return error instanceof Error ? error : new Error(String(error));
  });
  if (captured instanceof Error) return { ok: false, error: captured.message };

  const [poster, filmstrip] = await Promise.all([
    captured.poster.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    captured.filmstrip.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
  ]);

  const begun = await tools.run('design_library_assets', {
    action: 'begin',
    fileName: 'frames.webp',
    mediaType: 'image/webp',
    previewMediaType: 'image/webp',
    kind: 'image',
    sourceKind: 'file',
    // Nothing on the `original` role: the clip is already stored, and this
    // upload exists only to carry what was captured from it.
    originalChunks: 0,
    previewChunks: chunkCount(poster.length),
    framesChunks: chunkCount(filmstrip.length),
    width: captured.width,
    height: captured.height,
  });

  const uploadId = (begun.details as { uploadId?: string } | undefined)?.uploadId;
  if (typeof uploadId !== 'string') {
    return { ok: false, error: 'The frame upload could not be started.' };
  }

  try {
    await sendChunks(tools, uploadId, 'preview', poster);
    await sendChunks(tools, uploadId, 'frames', filmstrip);
    await tools.run('design_library_assets', {
      action: 'attach-frames',
      uploadId,
      ...(target.kind === 'item'
        ? { itemId: target.itemId }
        : { designId: target.designId, assetId: target.assetId }),
    });
    return { ok: true };
  } catch (error) {
    // A half-sent upload would sit in staging until it aged out.
    await tools.run('design_library_assets', { action: 'abort', uploadId }).catch(() => undefined);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
