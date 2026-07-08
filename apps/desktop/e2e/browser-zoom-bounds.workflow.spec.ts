/**
 * Browser view / page-zoom bounds workflow test.
 *
 * Project: workflow. Requires a real Electron window with native
 * WebContentsView placement — runs only via the workflow project.
 *
 * Regression test for the zoom double-multiply bug: the renderer reports
 * the in-app browser's placeholder rect in CSS pixels, and the main process
 * converts that to DIP exactly once by multiplying by the page zoom factor
 * (electron/ipc/apps/browser.ts). A previous fix also multiplied in the
 * renderer, so at any non-100% zoom the native view was sized/positioned by
 * zoom² — bleeding across the window at 2×, collapsing to a corner at 0.5×.
 *
 * This asserts the surviving invariant end-to-end: the applied native view
 * bounds equal the placeholder's CSS rect scaled by the zoom factor ONCE,
 * and are provably not the zoom-squared value.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  waitForShell,
  type TempSeroHome,
} from './helpers';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page zoom factor as the main process sees it (same value the IPC handler uses). */
async function readMainZoom(): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win ? win.webContents.getZoomFactor() : 1;
  });
}

/**
 * Bounds of the visible in-app browser view. The active tab's WebContentsView
 * is the only child of the window's contentView with non-zero bounds (others
 * are parked off-screen at 0×0), so we pick that one.
 */
async function readActiveViewBounds(): Promise<Rect | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    for (const child of win.contentView.children) {
      const view = child as { getBounds?: () => Rect };
      const bounds = view.getBounds?.();
      if (bounds && bounds.width > 0 && bounds.height > 0) return bounds;
    }
    return null;
  });
}

/** CSS-pixel rect of the placeholder the renderer measures for setBounds. */
async function readViewportRect(): Promise<Rect> {
  return page.getByTestId('browser-viewport').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home?.cleanup();
  }
});

test.describe('Browser view zoom bounds', () => {
  test('native view bounds track a single zoom multiply, not zoom-squared', async () => {
    // Open the in-app browser and create a tab so a native WebContentsView
    // is attached and driven by the placeholder's bounds. The placeholder
    // (browser-viewport) only mounts once a tab exists — the empty panel
    // shows a "New tab" prompt instead.
    const opened = await page.evaluate(() => Boolean(window.__appControl?.showBrowserPanel()));
    expect(opened).toBe(true);
    const newTab = page.getByRole('button', { name: 'New tab', exact: false }).first();
    await expect(newTab).toBeVisible({ timeout: 10_000 });
    await newTab.click();
    await expect(page.getByTestId('browser-viewport').first()).toBeVisible({ timeout: 10_000 });

    // The active view exists with real bounds once the placeholder syncs.
    await expect.poll(readActiveViewBounds, { timeout: 10_000 }).not.toBeNull();

    // Zoom past 100% — the double-multiply bug is invisible at 1× (1² = 1).
    await page.locator('[aria-label="Zoom in"]').click();
    await expect.poll(readMainZoom, { timeout: 5_000 }).toBeGreaterThan(1);

    // Poll until the re-synced native bounds match the single-multiply
    // invariant (round(cssRect × zoom)), tolerating ±2px of double rounding.
    await expect
      .poll(
        async () => {
          const zoom = await readMainZoom();
          const rect = await readViewportRect();
          const bounds = await readActiveViewBounds();
          if (!bounds || zoom <= 1) return 'not-ready';
          const expectedW = Math.round(rect.width * zoom);
          const expectedX = Math.round(rect.x * zoom);
          const ok = Math.abs(bounds.width - expectedW) <= 2 && Math.abs(bounds.x - expectedX) <= 2;
          return ok ? 'ok' : `bounds=${JSON.stringify(bounds)} expectedW=${expectedW} zoom=${zoom} rect=${JSON.stringify(rect)}`;
        },
        { timeout: 10_000 },
      )
      .toBe('ok');

    // Explicitly prove it is NOT the zoom-squared value the old bug produced.
    const zoom = await readMainZoom();
    const rect = await readViewportRect();
    const bounds = await readActiveViewBounds();
    expect(bounds).not.toBeNull();
    const squaredW = Math.round(rect.width * zoom * zoom);
    // At zoom > 1 the squared width differs from the correct width by a clear
    // margin (~zoom-1 of a large panel), so this guards against a regression.
    expect(Math.abs(bounds!.width - squaredW)).toBeGreaterThan(2);
  });
});
