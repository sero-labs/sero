import type { SeroWebHostBridge } from '@sero-ai/common';
import type { AppTools } from '@sero-ai/app-runtime';

const CHUNK_BYTES = 512 * 1024;
const MAX_PREVIEW_EDGE = 960;

function appControl(): SeroWebHostBridge['appControl'] {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { sero?: SeroWebHostBridge }).sero?.appControl;
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function boundedPng(base64: string, width: number, height: number): Promise<Uint8Array> {
  if (Math.max(width, height) <= MAX_PREVIEW_EDGE) return bytesFromBase64(base64);
  const source = new Blob([Uint8Array.from(bytesFromBase64(base64)).buffer], { type: 'image/png' });
  const bitmap = await createImageBitmap(source);
  const scale = MAX_PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('The Gallery preview could not be resized.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!result) throw new Error('The Gallery preview could not be resized.');
  return new Uint8Array(await result.arrayBuffer());
}

/** Capture the visible preview and stage its bounded PNG for `gallery.save`. */
export async function captureGalleryPreview(
  tools: AppTools,
  element: HTMLElement,
): Promise<string> {
  const capture = appControl()?.captureRegion;
  if (!capture) throw new Error('This Sero version cannot capture Gallery previews.');
  const box = element.getBoundingClientRect();
  const base64 = await capture({ x: box.x, y: box.y, width: box.width, height: box.height });
  if (!base64) throw new Error('The Design preview could not be captured.');
  const bytes = await boundedPng(base64, box.width, box.height);
  const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
  const begun = await tools.run('design_library_assets', {
    action: 'begin',
    purpose: 'gallery-preview',
    fileName: 'gallery-preview.png',
    mediaType: 'image/png',
    kind: 'image',
    sourceKind: 'file',
    originalChunks: chunks,
    previewChunks: 0,
  });
  const uploadId = begun.details?.uploadId;
  if (typeof uploadId !== 'string') throw new Error('The Gallery preview upload could not start.');

  try {
    for (let index = 0; index < chunks; index += 1) {
      const chunk = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
      // Bounded tool calls must stay ordered; the staging record verifies the sequence.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await tools.run('design_library_assets', {
        action: 'chunk', uploadId, role: 'original', index, data: toBase64(chunk),
      });
    }
    await tools.run('design_library_assets', { action: 'complete', uploadId });
    return uploadId;
  } catch (error) {
    await tools.run('design_library_assets', { action: 'abort', uploadId }).catch(() => undefined);
    throw error;
  }
}
