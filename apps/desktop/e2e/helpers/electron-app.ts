import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

/**
 * Options for launching the Sero Electron app in tests.
 */
export interface LaunchOptions {
  /** Extra environment variables merged into the Electron process. */
  env?: Record<string, string>;
  /** Override the SERO_HOME directory (defaults to a temp dir). */
  seroHome?: string;
}

/**
 * Launch the Sero Electron application for e2e testing.
 *
 * Returns the ElectronApplication handle and the first BrowserWindow page.
 * The app is started from the built output in dist/electron/main.mjs.
 *
 * Call `app.close()` in your test teardown.
 */
export async function launchSeroApp(
  options: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const desktopRoot = path.resolve(__dirname, '../..');
  const mainEntry = path.join(desktopRoot, 'dist/electron/main.mjs');

  const app = await electron.launch({
    args: [mainEntry],
    cwd: desktopRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Isolate test data from real user data
      SERO_HOME: options.seroHome ?? path.join(desktopRoot, '.sero-test-data'),
      // Disable container system during e2e tests (no macOS Virtualization)
      SERO_DISABLE_CONTAINERS: '1',
      // Disable the HTTP proxy for containers
      SERO_CONTAINER_PROXY: '0',
      ...options.env,
    },
  });

  // Wait for the first BrowserWindow to appear
  const page = await app.firstWindow();

  // Wait for the renderer to finish initial loading
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

/**
 * Evaluate a function in the Electron main process.
 *
 * Useful for inspecting main-process state, calling IPC handlers
 * directly, or setting up test fixtures.
 *
 * @example
 *   const version = await evaluateInMain(app, () => process.versions.electron);
 */
export async function evaluateInMain<T>(
  app: ElectronApplication,
  fn: () => T | Promise<T>,
): Promise<T> {
  return app.evaluate(fn);
}

/**
 * Get the title of the main BrowserWindow.
 */
export async function getWindowTitle(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.getTitle() ?? '';
  });
}

/**
 * Check if the app's main window is visible.
 */
export async function isWindowVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isVisible() ?? false;
  });
}
