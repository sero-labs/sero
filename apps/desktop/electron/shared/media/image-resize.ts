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
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasResized: boolean;
}

export interface PreparedToolImage {
  data: string;
  mimeType: string;
  text?: string;
  resize: ImageResizeResult;
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
 * @returns Resized image data + updated mimeType + original/final dimensions
 */
export function resizeImageForApi(base64Data: string, mimeType: string): ImageResizeResult {
  const inputBuffer = Buffer.from(base64Data, 'base64');
  if (typeof nativeImage?.createFromBuffer !== 'function') {
    return {
      data: base64Data,
      mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  }

  const img = nativeImage.createFromBuffer(inputBuffer);
  if (img.isEmpty()) {
    return {
      data: base64Data,
      mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  }

  const originalSize = img.getSize();
  const originalWidth = originalSize.width;
  const originalHeight = originalSize.height;

  if (
    inputBuffer.length <= MAX_BYTES &&
    originalWidth <= MAX_WIDTH &&
    originalHeight <= MAX_HEIGHT
  ) {
    return {
      data: base64Data,
      mimeType,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
      wasResized: false,
    };
  }

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (targetWidth > MAX_WIDTH) {
    targetHeight = Math.round((targetHeight * MAX_WIDTH) / targetWidth);
    targetWidth = MAX_WIDTH;
  }
  if (targetHeight > MAX_HEIGHT) {
    targetWidth = Math.round((targetWidth * MAX_HEIGHT) / targetHeight);
    targetHeight = MAX_HEIGHT;
  }

  function tryEncode(
    width: number,
    height: number,
    jpegQuality: number,
  ): { buffer: Buffer; mimeType: string } {
    const resized =
      width === originalWidth && height === originalHeight
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
  let finalWidth = targetWidth;
  let finalHeight = targetHeight;

  let best = tryEncode(targetWidth, targetHeight, 80);
  if (best.buffer.length <= MAX_BYTES) {
    return {
      data: best.buffer.toString('base64'),
      mimeType: best.mimeType,
      originalWidth,
      originalHeight,
      width: finalWidth,
      height: finalHeight,
      wasResized: true,
    };
  }

  for (const quality of qualitySteps) {
    best = tryEncode(targetWidth, targetHeight, quality);
    if (best.buffer.length <= MAX_BYTES) {
      return {
        data: best.buffer.toString('base64'),
        mimeType: best.mimeType,
        originalWidth,
        originalHeight,
        width: finalWidth,
        height: finalHeight,
        wasResized: true,
      };
    }
  }

  const scaleSteps = [0.75, 0.5, 0.35, 0.25];
  for (const scale of scaleSteps) {
    finalWidth = Math.round(targetWidth * scale);
    finalHeight = Math.round(targetHeight * scale);
    if (finalWidth < 100 || finalHeight < 100) break;

    for (const quality of qualitySteps) {
      best = tryEncode(finalWidth, finalHeight, quality);
      if (best.buffer.length <= MAX_BYTES) {
        return {
          data: best.buffer.toString('base64'),
          mimeType: best.mimeType,
          originalWidth,
          originalHeight,
          width: finalWidth,
          height: finalHeight,
          wasResized: true,
        };
      }
    }
  }

  return {
    data: best.buffer.toString('base64'),
    mimeType: best.mimeType,
    originalWidth,
    originalHeight,
    width: finalWidth,
    height: finalHeight,
    wasResized: true,
  };
}

/**
 * Format a dimension note for resized images.
 * Helps the model map coordinates back to the original image.
 */
export function formatDimensionNote(result: ImageResizeResult): string | undefined {
  if (!result.wasResized || result.width <= 0 || result.height <= 0) {
    return undefined;
  }
  const scale = result.originalWidth / result.width;
  return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}

export function prepareToolImage(base64Data: string, mimeType: string, text?: string): PreparedToolImage {
  const resize = resizeImageForApi(base64Data, mimeType);
  const normalizedText = [text?.trim(), formatDimensionNote(resize)].filter(Boolean).join('\n') || undefined;
  return {
    data: resize.data,
    mimeType: resize.mimeType,
    text: normalizedText,
    resize,
  };
}
