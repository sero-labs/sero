export type DashboardBackgroundMimeType = 'image/png' | 'image/jpeg';

export interface DashboardBackgroundImageInfo {
  mimeType: DashboardBackgroundMimeType;
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function inspectPng(data: Buffer): DashboardBackgroundImageInfo | null {
  if (
    data.length < 26
    || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || data.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }

  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width === 0 || height === 0) return null;

  return {
    mimeType: 'image/png',
    width,
    height,
  };
}

function inspectJpeg(data: Buffer): DashboardBackgroundImageInfo | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < data.length) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;

    const marker = data[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return null;

    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) return null;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return null;
      return {
        mimeType: 'image/jpeg',
        width,
        height,
      };
    }
    offset += segmentLength;
  }

  return null;
}

export function inspectDashboardBackgroundImage(
  data: Buffer,
): DashboardBackgroundImageInfo | null {
  return inspectPng(data) ?? inspectJpeg(data);
}
