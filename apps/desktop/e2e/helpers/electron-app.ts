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
  /**
   * Enable the macOS container system (Virtualization framework).
   *
   * - `false` (default): Disables the HTTP proxy (`SERO_CONTAINER_PROXY=0`).
   *   The container binary may still be called but will fail gracefully
   *   in environments without the Virtualization framework (CI, Linux).
   * - `true`: Full container support. Requires macOS with the `container`
   *   binary available. Used by the "local" Playwright project.
   */
  containers?: boolean;
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

  const containers = options.containers ?? false;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NODE_ENV: 'test',
    // Isolate test data from real user data
    SERO_HOME: options.seroHome ?? path.join(desktopRoot, '.sero-test-data'),
  };

  if (!containers) {
    // Disable the HTTP proxy — the container system's lifecycle calls
    // (ensureSystemRunning, ensureImage) will still run but fail gracefully
    // when the `container` binary is missing.
    env.SERO_CONTAINER_PROXY = '0';
  }

  // Merge caller overrides last so they win
  Object.assign(env, options.env);

  const app = await electron.launch({
    args: [mainEntry],
    cwd: desktopRoot,
    env,
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
