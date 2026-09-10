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

import { BrowserWindow, nativeImage, screen } from 'electron';
import type { AppPanelRect } from '@/types/ipc';

interface CaptureState {
  count: number;
  throttled: boolean;
  ownsDebugger: boolean;
  onDebuggerDetach?: () => void;
}

const capturing = new WeakMap<BrowserWindow, CaptureState>();
const stalledNativeCaptures = new WeakSet<BrowserWindow>();
const CAPTURE_TIMEOUT_MS = 2_000;

/** Let hidden child frames paint without bringing the user's window forward. */
async function paintForCapture(win: BrowserWindow): Promise<{ release(): void; state: CaptureState }> {
  const active = capturing.get(win) ?? { count: 0, throttled: win.webContents.getBackgroundThrottling(), ownsDebugger: false };
  active.count += 1;
  capturing.set(win, active);
  win.webContents.setBackgroundThrottling(false);
  const release = (): void => {
    active.count -= 1;
    if (active.count === 0) {
      capturing.delete(win);
      if (!win.isDestroyed()) {
        const debuggerApi = win.webContents.debugger;
        if (active.onDebuggerDetach) debuggerApi.removeListener('detach', active.onDebuggerDetach);
        if (active.ownsDebugger && debuggerApi.isAttached()) debuggerApi.detach();
        win.webContents.setBackgroundThrottling(active.throttled);
      }
    }
  };
  try {
    await win.webContents.executeJavaScript('new Promise(resolve => { setTimeout(resolve, 250); requestAnimationFrame(() => requestAnimationFrame(resolve)); })');
    return { release, state: active };
  } catch (error) { release(); throw error; }
}

/** Electron capturePage can remain pending after a debugger-driven navigation. */
async function captureImage(
  win: BrowserWindow,
  rect: Electron.Rectangle,
  cssToDisplay: number,
  state: CaptureState,
): Promise<Electron.NativeImage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!stalledNativeCaptures.has(win)) {
      const image = await Promise.race([
        win.webContents.capturePage(rect),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS); }),
      ]);
      if (image) return image;
      // Do not accumulate more unresolved native captures while recording.
      stalledNativeCaptures.add(win);
      clearTimeout(timer);
    }
    const debuggerApi = win.webContents.debugger;
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3');
      state.ownsDebugger = true;
      state.onDebuggerDetach = () => { state.ownsDebugger = false; };
      debuggerApi.once('detach', state.onDebuggerDetach);
    }
    const response: unknown = await Promise.race([
      debuggerApi.sendCommand('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false,
        clip: { x: rect.x / cssToDisplay, y: rect.y / cssToDisplay,
          width: rect.width / cssToDisplay, height: rect.height / cssToDisplay, scale: 1 },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Screenshot capture timed out')), CAPTURE_TIMEOUT_MS);
      }),
    ]);
    if (!response || typeof response !== 'object' || !('data' in response) || typeof response.data !== 'string') {
      throw new Error('Screenshot capture returned no PNG data');
    }
    const image = nativeImage.createFromBuffer(Buffer.from(response.data, 'base64'));
    if (image.isEmpty()) throw new Error('Screenshot capture returned an empty image');
    return image;
  } finally { clearTimeout(timer); }
}

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

  if (captureArea.width <= 0 || captureArea.height <= 0) return null;
  const capture = await paintForCapture(win);
  let image: Electron.NativeImage;
  try { image = await captureImage(win, captureArea, cssToDisplay, capture.state); }
  finally { capture.release(); }
  const targetWidth = Math.max(1, Math.round(cssRect.width));
  const targetHeight = Math.max(1, Math.round(cssRect.height));
  const size = image.getSize();
  const normalized = size.width === targetWidth && size.height === targetHeight
    ? image
    : image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });

  return normalized.toPNG().toString('base64');
}
