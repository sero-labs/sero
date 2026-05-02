import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

const MAIN_PROCESS_EVAL_RETRIES = 5;
const MAIN_PROCESS_EVAL_RETRY_DELAY_MS = 200;

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
    // Isolate test data from real user data. env.ts resolves profiles via
    // SERO_HOME_OVERRIDE in tests; SERO_HOME is set later by loadSeroEnv().
    SERO_HOME_OVERRIDE: options.seroHome ?? path.join(desktopRoot, '.sero-test-data'),
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

function isTransientMainProcessEvaluateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Execution context was destroyed')
    || message.includes('most likely because of a navigation');
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryMainProcessEvaluate<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAIN_PROCESS_EVAL_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMainProcessEvaluateError(error) || attempt === MAIN_PROCESS_EVAL_RETRIES - 1) {
        throw error;
      }
      await delay(MAIN_PROCESS_EVAL_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Evaluate a function in the Electron main process.
 *
 * Useful for inspecting main-process state, calling IPC handlers
 * directly, or setting up test fixtures.
 *
 * Retries briefly when Electron is still swapping execution contexts during
 * startup/navigation, which can happen in headless CI right after launch.
 *
 * @example
 *   const version = await evaluateInMain(app, () => process.versions.electron);
 */
async function evaluateInMain<T>(
  app: ElectronApplication,
  fn: Parameters<ElectronApplication['evaluate']>[0],
): Promise<T> {
  return retryMainProcessEvaluate(() => app.evaluate(fn as never));
}

/**
 * Get the title of the main BrowserWindow.
 */
export async function getWindowTitle(app: ElectronApplication): Promise<string> {
  return evaluateInMain(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.getTitle() ?? '';
  });
}

/**
 * Check if the app's main window is visible.
 */
export async function isWindowVisible(app: ElectronApplication): Promise<boolean> {
  return evaluateInMain(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isVisible() ?? false;
  });
}
