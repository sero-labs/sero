/**
 * Image resizing for API submission.
 *
 * Uses Electron's nativeImage (zero-dependency) to ensure images stay within
 * Anthropic's 5MB limit. Strategy mirrors Pi CLI's image-resize.ts:
 *
 * 1. Check if already within dimension + size limits — return unchanged
 * 2. Resize to maxWidth/maxHeight
 * 3. Try PNG (good for screenshots), pick if small enough
 * 4. Try JPEG with decreasing quality
 * 5. Progressively reduce dimensions if still too large
 */

import { nativeImage } from 'electron';

export interface ImageResizeResult {
  data: string; // base64
  mimeType: string;
  wasResized: boolean;
}

// 4.5MB — provides headroom below Anthropic's 5MB limit (matches Pi CLI)
const MAX_BYTES = 4.5 * 1024 * 1024;
const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;

/** Pick the smaller of two encoded buffers. */
function pickSmaller(
  a: { buffer: Buffer; mimeType: string },
  b: { buffer: Buffer; mimeType: string },
): { buffer: Buffer; mimeType: string } {
  return a.buffer.length <= b.buffer.length ? a : b;
}

/**
 * Resize a base64-encoded image to fit within API limits.
 *
 * @param base64Data Raw base64 string (no data: prefix)
 * @param mimeType   Original MIME type (e.g. "image/png")
 * @returns Resized image data + updated mimeType
 */
export function resizeImageForApi(base64Data: string, mimeType: string): ImageResizeResult {
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // Fast path: if small enough, check dimensions
  if (inputBuffer.length <= MAX_BYTES) {
    const img = nativeImage.createFromBuffer(inputBuffer);
    if (img.isEmpty()) {
      return { data: base64Data, mimeType, wasResized: false };
    }
    const size = img.getSize();
    if (size.width <= MAX_WIDTH && size.height <= MAX_HEIGHT) {
      return { data: base64Data, mimeType, wasResized: false };
    }
  }

  // Load the image
  const img = nativeImage.createFromBuffer(inputBuffer);
  if (img.isEmpty()) {
    // Can't process — return as-is and let the API reject if needed
    return { data: base64Data, mimeType, wasResized: false };
  }

  const originalSize = img.getSize();

  // Calculate target dimensions respecting max limits
  let targetWidth = originalSize.width;
  let targetHeight = originalSize.height;

  if (targetWidth > MAX_WIDTH) {
    targetHeight = Math.round((targetHeight * MAX_WIDTH) / targetWidth);
    targetWidth = MAX_WIDTH;
  }
  if (targetHeight > MAX_HEIGHT) {
    targetWidth = Math.round((targetWidth * MAX_HEIGHT) / targetHeight);
    targetHeight = MAX_HEIGHT;
  }

  // Helper: resize to dimensions, try both PNG & JPEG, return smaller
  function tryEncode(
    width: number,
    height: number,
    jpegQuality: number,
  ): { buffer: Buffer; mimeType: string } {
    const resized =
      width === originalSize.width && height === originalSize.height
        ? img
        : img.resize({ width, height, quality: 'better' });

    const pngBuffer = resized.toPNG();
    const jpegBuffer = resized.toJPEG(jpegQuality);

    return pickSmaller(
      { buffer: pngBuffer, mimeType: 'image/png' },
      { buffer: jpegBuffer, mimeType: 'image/jpeg' },
    );
  }

  const qualitySteps = [85, 70, 55, 40];

  // Attempt 1: resize to target dimensions, try both formats
  let best = tryEncode(targetWidth, targetHeight, 80);
  if (best.buffer.length <= MAX_BYTES) {
    return { data: best.buffer.toString('base64'), mimeType: best.mimeType, wasResized: true };
  }

  // Attempt 2: JPEG with decreasing quality at target dimensions
  for (const quality of qualitySteps) {
    best = tryEncode(targetWidth, targetHeight, quality);
    if (best.buffer.length <= MAX_BYTES) {
      return { data: best.buffer.toString('base64'), mimeType: best.mimeType, wasResized: true };
    }
  }

  // Attempt 3: progressively reduce dimensions
  const scaleSteps = [0.75, 0.5, 0.35, 0.25];
  for (const scale of scaleSteps) {
    const w = Math.round(targetWidth * scale);
    const h = Math.round(targetHeight * scale);
    if (w < 100 || h < 100) break;

    for (const quality of qualitySteps) {
      best = tryEncode(w, h, quality);
      if (best.buffer.length <= MAX_BYTES) {
        return { data: best.buffer.toString('base64'), mimeType: best.mimeType, wasResized: true };
      }
    }
  }

  // Last resort: return the smallest we produced
  return { data: best.buffer.toString('base64'), mimeType: best.mimeType, wasResized: true };
}
