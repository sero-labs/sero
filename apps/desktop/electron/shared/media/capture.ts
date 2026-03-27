/**
 * Shared screen capture utility.
 *
 * Converts CSS pixel coordinates (from getBoundingClientRect) to DIP
 * coordinates for Electron's capturePage(), handling display scaling
 * and zoom factors. Used by both IPC handlers and CLI commands.
 *
 * Important: interaction coordinates (`sero app click --x/--y`) are expressed
 * in CSS pixels relative to the app panel. After capturePage() returns a
 * high-DPI image, we resize it back to CSS-pixel dimensions so the screenshot
 * the model sees matches the coordinate space it must click in.
 */

import { BrowserWindow, screen } from 'electron';
import type { AppPanelRect } from '../../../src/types/ipc';

/**
 * Capture a region of the window as a PNG base64 string.
 *
 * `cssRect` is in CSS pixels (from getBoundingClientRect). capturePage()
 * expects DIP coordinates, which can differ when there's display scaling
 * or a zoom factor (DPR ≠ native scale). The conversion ratio is:
 *   DIP = CSS × (devicePixelRatio / nativeDisplayScale)
 */
export async function captureRegion(
  win: BrowserWindow,
  cssRect: AppPanelRect,
): Promise<string | null> {
  if (cssRect.width <= 0 || cssRect.height <= 0) return null;

  // Convert CSS px → DIP: ratio = devicePixelRatio / nativeDisplayScale
  const dpr = await win.webContents.executeJavaScript('window.devicePixelRatio') as number;
  const display = screen.getDisplayMatching(win.getBounds());
  const cssToDisplay = dpr / display.scaleFactor;

  // Compute DIP rect from CSS edges to avoid accumulating rounding errors
  const x = Math.floor(cssRect.x * cssToDisplay);
  const y = Math.floor(cssRect.y * cssToDisplay);
  const right = Math.ceil((cssRect.x + cssRect.width) * cssToDisplay);
  const bottom = Math.ceil((cssRect.y + cssRect.height) * cssToDisplay);

  // Clamp to content area to prevent out-of-bounds capture
  const bounds = win.getContentBounds();
  const captureArea = {
    x,
    y,
    width: Math.min(right, bounds.width) - x,
    height: Math.min(bottom, bounds.height) - y,
  };

  const image = await win.webContents.capturePage(captureArea);
  const targetWidth = Math.max(1, Math.round(cssRect.width));
  const targetHeight = Math.max(1, Math.round(cssRect.height));
  const size = image.getSize();
  const normalized = size.width === targetWidth && size.height === targetHeight
    ? image
    : image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });

  return normalized.toPNG().toString('base64');
}
