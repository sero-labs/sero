/**
 * QR code generation — thin wrapper around the `qrcode` npm package.
 *
 * Generates QR codes as SVG strings or data: URLs for use in the
 * ConnectDeviceDialog (desktop app) and IPC handlers.
 */

import QRCode from 'qrcode';

/**
 * Generate a QR code as an SVG string.
 * Includes the spec-mandated quiet zone and uses error correction level M.
 */
export async function generateQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
  });
}

/**
 * Generate a QR code as a data: URL (SVG, base64-encoded).
 * Suitable for use in `<img src="...">` tags.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  // Generate SVG string then convert to data URL manually so we get
  // a clean SVG (QRCode.toDataURL produces a canvas-based PNG).
  const svg = await generateQrSvg(text);
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
