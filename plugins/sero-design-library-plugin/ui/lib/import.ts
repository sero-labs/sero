import type { AppTools } from '@sero-ai/app-runtime';

/**
 * The renderer half of the import pipeline.
 *
 * File picker, drag-and-drop and clipboard paste all end up here with a `File`,
 * which is why all three behave identically downstream. The renderer does two
 * things the runtime cannot: it reads the user's chosen bytes, and it has a
 * canvas to downscale them with — so the preview is produced here rather than
 * pulling an image library into the background runtime.
 */

/** Must match `UPLOAD_CHUNK_BYTES` in shared/uploads.ts. */
const CHUNK_BYTES = 512 * 1024;
const PREVIEW_MAX_EDGE = 768;
const PREVIEW_QUALITY = 0.82;

export interface ImportProgress {
  fileName: string;
  /** 0–1 across the whole file. */
  progress: number;
}

export type ImportSourceKind = 'file' | 'drop' | 'paste';

function toBase64(bytes: Uint8Array): string {
  // Chunked so a large buffer cannot blow the argument limit on spread.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  return createImageBitmap(file).catch(() => null);
}

interface Preview {
  bytes: Uint8Array;
  mediaType: string;
  /** The source image's own dimensions, taken while it was already decoded. */
  width: number;
  height: number;
}

/**
 * Downscale to a grid-sized thumbnail. Returns null when the browser cannot
 * decode the file — an SVG or an exotic format still imports, it just shows
 * its original in the grid.
 */
async function buildPreview(file: File): Promise<Preview | null> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) return null;

  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', PREVIEW_QUALITY),
  );
  if (!blob) return null;
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mediaType: blob.type,
    width: sourceWidth,
    height: sourceHeight,
  };
}

async function sendChunks(
  tools: AppTools,
  uploadId: string,
  role: 'original' | 'preview',
  bytes: Uint8Array,
  onChunk: (sent: number) => void,
): Promise<void> {
  for (let index = 0; index * CHUNK_BYTES < bytes.length; index += 1) {
    const slice = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    // Sequential by necessity: the runtime appends chunks in arrival order, and
    // sending them together would put the whole file in flight at once.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await tools.run('design_library_assets', {
      action: 'chunk',
      uploadId,
      role,
      index,
      data: toBase64(slice),
    });
    onChunk(slice.length);
  }
}

function chunkCount(byteLength: number): number {
  return Math.ceil(byteLength / CHUNK_BYTES);
}

export interface ImportResult {
  fileName: string;
  ok: boolean;
  error?: string;
}

export async function importFile(
  tools: AppTools,
  file: File,
  sourceKind: ImportSourceKind,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  // One decode, not two: the preview pass already knows the source dimensions,
  // and decoding a second time just to read them doubles the work per import.
  const [original, preview] = await Promise.all([
    file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    buildPreview(file),
  ]);
  const dimensions = preview ? { width: preview.width, height: preview.height } : {};

  const totalBytes = original.length + (preview?.bytes.length ?? 0);
  let sent = 0;
  const report = (bytes: number) => {
    sent += bytes;
    onProgress?.({ fileName: file.name, progress: Math.min(1, sent / Math.max(1, totalBytes)) });
  };

  const begun = await tools.run('design_library_assets', {
    action: 'begin',
    fileName: file.name,
    mediaType: file.type || 'application/octet-stream',
    previewMediaType: preview?.mediaType ?? 'image/webp',
    kind: 'image',
    sourceKind,
    originalChunks: chunkCount(original.length),
    previewChunks: preview ? chunkCount(preview.bytes.length) : 0,
    ...dimensions,
  });

  const uploadId = (begun.details as { uploadId?: string } | undefined)?.uploadId;
  if (typeof uploadId !== 'string') {
    return { fileName: file.name, ok: false, error: begun.text || 'The import could not be started.' };
  }

  try {
    await sendChunks(tools, uploadId, 'original', original, report);
    if (preview) await sendChunks(tools, uploadId, 'preview', preview.bytes, report);
    await tools.run('design_library_assets', { action: 'complete', uploadId });
    return { fileName: file.name, ok: true };
  } catch (error) {
    // A half-sent upload would sit in the staging area until it aged out, so
    // it is discarded as soon as we know it failed.
    await tools.run('design_library_assets', { action: 'abort', uploadId }).catch(() => undefined);
    return {
      fileName: file.name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Importing your own video is deferred: generated video is supported, but a
 * dropped video file has no preview path (the canvas cannot decode it) and
 * would reach the Librarian as image bytes. Until frame extraction ships, the
 * picker, the drop target and the paste handler all agree on images only.
 */
const IMPORTABLE = /^image\//;

export function importableFiles(files: Iterable<File>): File[] {
  return [...files].filter((file) => IMPORTABLE.test(file.type));
}

/** Clipboard paste hands us items rather than files. */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  return importableFiles(
    [...data.items].flatMap((item) => {
      if (item.kind !== 'file') return [];
      const file = item.getAsFile();
      return file === null ? [] : [file];
    }),
  );
}
