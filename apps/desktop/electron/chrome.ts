/**
 * Shared application-chrome constants for the main process.
 *
 * The renderer counter-scales the chrome bars by the page zoom factor
 * (`--zoom-factor` in global.css), so these heights are physical (DIP)
 * sizes that hold at every zoom level. Keep in sync with the `h-10`
 * title bar and `h-6` status bar in the renderer.
 */

/** Title bar height in DIP. */
export const CHROME_BAR_HEIGHT = 40;

const MACOS_TRAFFIC_LIGHT_DIAMETER = 12;
const MACOS_TRAFFIC_LIGHT_X = 12;
const MACOS_TRAFFIC_LIGHT_Y_CORRECTION = -3;

export function getMacTrafficLightPosition() {
  return {
    x: MACOS_TRAFFIC_LIGHT_X,
    y: Math.round((CHROME_BAR_HEIGHT - MACOS_TRAFFIC_LIGHT_DIAMETER) / 2)
      + MACOS_TRAFFIC_LIGHT_Y_CORRECTION,
  };
}

/** Default window background — matches dark `--bg-base`. */
export const CHROME_BACKGROUND_COLOR = '#0a0a0b';

/** Default Windows title-bar overlay symbol color — matches dark `--text-secondary`. */
export const CHROME_OVERLAY_SYMBOL_COLOR = '#a1a1aa';

/**
 * Per-platform window frame. The renderer draws one identical chrome
 * everywhere; only the window-control corner differs:
 *   macOS   — native traffic lights over the custom bar (hiddenInset)
 *   Windows — native overlay buttons (min/max/close + snap layouts)
 *   Linux   — frameless; the renderer draws its own controls via IPC
 */
export function platformFrameOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: getMacTrafficLightPosition(),
    };
  }
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        height: CHROME_BAR_HEIGHT,
        color: CHROME_BACKGROUND_COLOR,
        symbolColor: CHROME_OVERLAY_SYMBOL_COLOR,
      },
    };
  }
  return { frame: false };
}
