import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import type { RuntimeBackend } from './runtime';
import { currentRuntimeFromEnv, runtimeAvailableOn } from './runtime';

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
   * Runtime backend to exercise. Sets SERO_E2E_RUNTIME for downstream
   * code to read:
   *   - 'host'            — direct execution against the host filesystem
   *   - 'apple-container' — requires macOS Virtualization framework
   *   - 'docker'          — requires Docker daemon on Linux
   *
   * Defaults to 'host' when omitted. Specs that require an unavailable
   * runtime on the current platform should use the runtime helper to skip.
   */
  runtime?: RuntimeBackend;
  /**
   * @deprecated Prefer `runtime`. When set, `runtime` wins.
   * Kept temporarily so unmigrated specs still launch.
   */
  containers?: boolean;
  /**
   * Optional seeder run after the temp SERO_HOME is created but BEFORE
   * Electron launches. Receives the resolved SERO_HOME path so the
   * seeder can write profiles/, workspaces.json, auth.json, etc.
   */
  seed?: (seroHome: string) => void | Promise<void>;
  /**
   * Intercept `app.relaunch()` / `app.exit()` calls so profile-switch
   * tests can assert the call was made without actually relaunching.
   * The intercepted call is exposed via `__seroRelaunchCalls` on the
   * main-process global for in-test assertions.
   */
  mockRelaunch?: boolean;
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

  const runtime: RuntimeBackend =
    options.runtime ?? (options.containers ? 'apple-container' : currentRuntimeFromEnv() ?? 'host');

  if (!runtimeAvailableOn(runtime, process.platform as 'darwin' | 'linux' | 'win32')) {
    throw new Error(
      `launchSeroApp: runtime "${runtime}" is not available on platform "${process.platform}". ` +
        'Spec authors should call runtimeSkipReason() and test.skip() before reaching the launcher.',
    );
  }

  const seroHome = options.seroHome ?? path.join(desktopRoot, '.sero-test-data');

  if (options.seed) {
    await options.seed(seroHome);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    SERO_HOME_OVERRIDE: seroHome,
    SERO_E2E_RUNTIME: runtime,
  };

  if (options.mockRelaunch) {
    env.SERO_E2E_MOCK_RELAUNCH = '1';
  }

  Object.assign(env, options.env);

  const app = await electron.launch({
    args: [mainEntry],
    cwd: desktopRoot,
    env,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  if (options.mockRelaunch) {
    await app.evaluate(({ app: electronApp }) => {
      const calls: Array<{ method: 'relaunch' | 'exit'; args: unknown[] }> = [];
      (globalThis as Record<string, unknown>).__seroRelaunchCalls = calls;
      const originalRelaunch = electronApp.relaunch.bind(electronApp);
      const originalExit = electronApp.exit.bind(electronApp);
      electronApp.relaunch = ((...args: unknown[]) => {
        calls.push({ method: 'relaunch', args });
      }) as typeof electronApp.relaunch;
      electronApp.exit = ((...args: unknown[]) => {
        calls.push({ method: 'exit', args });
      }) as typeof electronApp.exit;
      void originalRelaunch;
      void originalExit;
    });
  }

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
