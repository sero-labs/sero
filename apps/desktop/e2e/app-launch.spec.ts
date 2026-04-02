import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp, getWindowTitle, isWindowVisible, layout } from './helpers';

/**
 * Basic Electron app launch tests.
 *
 * Verifies the Sero desktop app starts, creates a window, and renders
 * the shell UI correctly.
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchSeroApp());
});

test.afterAll(async () => {
  await app.close();
});

test.describe('App Launch', () => {
  test('should create a visible window', async () => {
    // The window is created with show:false and shown on 'ready-to-show',
    // which may fire after domcontentloaded. Poll briefly.
    await expect.poll(() => isWindowVisible(app), { timeout: 10_000 }).toBe(true);
  });

  test('should set the correct window title', async () => {
    const title = await getWindowTitle(app);
    // Title may include workspace name or default "Sero"
    expect(title).toBeTruthy();
  });

  // UI rendering tests — Electron windows don't reliably render in headless CI.
  // Run locally with test:e2e:local or test:e2e:headed.
  test('should render the main app shell', async () => {
    test.skip(!!process.env.CI, 'UI rendering test — skipped in CI');
    // The flex container wrapping the entire UI
    await expect(page.locator(layout.appShell).first()).toBeVisible();
  });

  test('should render the title bar', async () => {
    test.skip(!!process.env.CI, 'UI rendering test — skipped in CI');
    await expect(page.locator(layout.titleBar)).toBeVisible();
  });

  test('should render the status bar', async () => {
    test.skip(!!process.env.CI, 'UI rendering test — skipped in CI');
    await expect(page.locator(layout.statusBar)).toBeVisible();
  });

  test('should have the sidebar toggle button', async () => {
    test.skip(!!process.env.CI, 'UI rendering test — skipped in CI');
    await expect(page.locator(layout.sidebarToggle)).toBeVisible();
  });

  test('should have the chat panel toggle button', async () => {
    test.skip(!!process.env.CI, 'UI rendering test — skipped in CI');
    await expect(page.locator(layout.chatToggle)).toBeVisible();
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

  test('should expose agent IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const sero = (window as any).sero;
      return {
        hasOpen: typeof sero?.agent?.open === 'function',
        hasPrompt: typeof sero?.agent?.prompt === 'function',
        hasAbort: typeof sero?.agent?.abort === 'function',
        hasClose: typeof sero?.agent?.close === 'function',
      };
    });
    expect(methods.hasOpen).toBe(true);
    expect(methods.hasPrompt).toBe(true);
    expect(methods.hasAbort).toBe(true);
    expect(methods.hasClose).toBe(true);
  });

  test('should expose VCS IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const sero = (window as any).sero;
      return {
        hasListCheckpoints: typeof sero?.vcs?.listCheckpoints === 'function',
        hasGetState: typeof sero?.vcs?.getState === 'function',
        hasCreateCheckpoint: typeof sero?.vcs?.createCheckpoint === 'function',
        hasRestore: typeof sero?.vcs?.restore === 'function',
        hasDiff: typeof sero?.vcs?.diff === 'function',
      };
    });
    expect(methods.hasListCheckpoints).toBe(true);
    expect(methods.hasGetState).toBe(true);
    expect(methods.hasCreateCheckpoint).toBe(true);
    expect(methods.hasRestore).toBe(true);
    expect(methods.hasDiff).toBe(true);
  });
});
