/**
 * App launch contract tests.
 *
 * Project: contract. Verifies the Electron main process boots,
 * a BrowserWindow is created, and the window title is populated.
 * No UI rendering assumptions.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchSeroApp, getWindowTitle, isWindowVisible, type TempSeroHome } from './helpers';

let app: ElectronApplication;
let page: Page;
let seroHome: TempSeroHome;

test.beforeAll(async () => {
  seroHome = createTempSeroHome();
  ({ app, page } = await launchSeroApp({ seroHome: seroHome.path }));
});

test.afterAll(async () => {
  await closeSeroApp(app);
  seroHome.cleanup();
});

test.describe('App Launch', () => {
  test('should create a visible window', async () => {
    // The window is created with show:false and shown on 'ready-to-show',
    // which may fire after domcontentloaded. Poll briefly.
    await expect.poll(() => isWindowVisible(app), { timeout: 10_000 }).toBe(true);
  });

  test('should set the correct window title', async () => {
    const title = await getWindowTitle(app);
    expect(title).toBe('Sero');
  });

  test('should expose the sero API on the renderer window', async () => {
    const hasApi = await page.evaluate(() => typeof (window as any).sero !== 'undefined');
    expect(hasApi).toBe(true);
  });

  test('should expose workspace IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const sero = (window as any).sero;
      return {
        hasList: typeof sero?.workspace?.list === 'function',
        hasCreate: typeof sero?.workspace?.create === 'function',
        hasRemove: typeof sero?.workspace?.remove === 'function',
      };
    });
    expect(methods.hasList).toBe(true);
    expect(methods.hasCreate).toBe(true);
    expect(methods.hasRemove).toBe(true);
  });

});
