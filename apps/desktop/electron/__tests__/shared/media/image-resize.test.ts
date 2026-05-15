import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFromBuffer: vi.fn(),
}));

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer,
  },
}));

function makeImage(
  size: { width: number; height: number },
  buffers: { png: Buffer; jpeg: Buffer } = { png: Buffer.from('png'), jpeg: Buffer.from('jpeg') },
) {
  return {
    isEmpty: () => false,
    getSize: () => size,
    resize: ({ width, height }: { width: number; height: number }) => makeImage({ width, height }, buffers),
    toPNG: () => buffers.png,
    toJPEG: () => buffers.jpeg,
  };
}

describe('image-resize helpers', () => {
  beforeEach(() => {
    mocks.createFromBuffer.mockReset();
  });

  it('keeps images unchanged when already within API limits', async () => {
    const { resizeImageForApi, formatDimensionNote } = await import('@electron/shared/media/image-resize');
    const input = Buffer.from('small-image').toString('base64');
    mocks.createFromBuffer.mockReturnValue(makeImage({ width: 800, height: 600 }));

    const result = resizeImageForApi(input, 'image/png');

    expect(result).toEqual({
      data: input,
      mimeType: 'image/png',
      originalWidth: 800,
      originalHeight: 600,
      width: 800,
      height: 600,
      wasResized: false,
    });
    expect(formatDimensionNote(result)).toBeUndefined();
  });

  it('adds Pi-style dimension notes for resized tool images', async () => {
    const { resizeImageForApi, formatDimensionNote, prepareToolImage } = await import('@electron/shared/media/image-resize');
    const input = Buffer.from('large-image').toString('base64');
    const jpeg = Buffer.from('small-jpeg');
    mocks.createFromBuffer.mockReturnValue(
      makeImage(
        { width: 4000, height: 2000 },
        { png: Buffer.alloc(6 * 1024 * 1024), jpeg },
      ),
    );

    const result = resizeImageForApi(input, 'image/png');
    const note = formatDimensionNote(result);
    const prepared = prepareToolImage(input, 'image/png', 'Screenshot ready');

    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      originalWidth: 4000,
      originalHeight: 2000,
      width: 2000,
      height: 1000,
      wasResized: true,
    });
    expect(result.data).toBe(jpeg.toString('base64'));
    expect(note).toBe('[Image: original 4000x2000, displayed at 2000x1000. Multiply coordinates by 2.00 to map to original image.]');
    expect(prepared).toMatchObject({
      data: jpeg.toString('base64'),
      mimeType: 'image/jpeg',
      resize: {
        originalWidth: 4000,
        originalHeight: 2000,
        width: 1600,
        height: 800,
        wasResized: true,
      },
    });
    expect(prepared.text).toBe('Screenshot ready\n[Image: original 4000x2000, displayed at 1600x800. Multiply coordinates by 2.50 to map to original image.]');
  });

  it('compresses tool images that are below API limits but too large for agent context', async () => {
    const { resizeImageForApi, prepareToolImage } = await import('@electron/shared/media/image-resize');
    const input = Buffer.alloc(734 * 1024).toString('base64');
    const jpeg = Buffer.alloc(250 * 1024);
    mocks.createFromBuffer.mockReturnValue(
      makeImage(
        { width: 1792, height: 1620 },
        { png: Buffer.alloc(734 * 1024), jpeg },
      ),
    );

    expect(resizeImageForApi(input, 'image/png').wasResized).toBe(false);

    const prepared = prepareToolImage(input, 'image/png', 'Attached screenshot');

    expect(prepared.data).toBe(jpeg.toString('base64'));
    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.resize).toMatchObject({
      originalWidth: 1792,
      originalHeight: 1620,
      width: 1600,
      height: 1446,
      wasResized: true,
    });
  });
});
