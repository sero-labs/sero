import { describe, expect, it } from 'vitest';

import { inspectDashboardBackgroundImage } from '@electron/shared/media/dashboard-background-image';

function pngBytes(width: number, height: number, colorType: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  return buffer;
}

function jpegBytes(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

describe('dashboard background image inspection', () => {
  it('reads PNG dimensions and type from bytes', () => {
    expect(inspectDashboardBackgroundImage(pngBytes(800, 600, 6))).toEqual({
      mimeType: 'image/png',
      width: 800,
      height: 600,
    });
  });

  it('reads JPEG dimensions and type after metadata segments', () => {
    expect(inspectDashboardBackgroundImage(jpegBytes(1920, 1080))).toEqual({
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
    });
  });

  it('rejects unsupported or malformed bytes', () => {
    expect(inspectDashboardBackgroundImage(Buffer.from('not an image'))).toBeNull();
    expect(inspectDashboardBackgroundImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});
