import {
  _electron as electron,
  chromium,
  type Browser,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'path';
import type { RuntimeBackend } from './runtime';
import { currentRuntimeFromEnv, runtimeAvailableOn } from './runtime';
import { createTempSeroHome, type TempSeroHome } from './seroHome';

const MAIN_PROCESS_EVAL_RETRIES = 5;
const MAIN_PROCESS_EVAL_RETRY_DELAY_MS = 200;
const ownedHomes = new WeakMap<ElectronApplication, TempSeroHome>();

/**
 * Options for launching the Sero Electron app in tests.
 */
export interface LaunchOptions {
  /** Extra environment variables merged into the Electron process. */
  env?: Record<string, string>;
  /** Environment variable names to remove from the inherited parent env before merging `env`. */
  withoutEnv?: string[];
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
  /**
   * Record the whole Electron window to a video in this directory (Playwright
   * `recordVideo`). Flushed on `closeSeroApp`; path via `page.video()?.path()`.
   * Defaults to the SERO_E2E_RECORD_VIDEO env var. Off unless set.
   */
  recordVideoDir?: string;
  /** Slow every Playwright action by this many ms (smoother demo footage). */
  slowMo?: number;
}

export function nestedSeroLaunchReason(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const hostPid = env.SERO_DESKTOP_HOST_PID;
  if (!hostPid) return undefined;
  return `Refusing to launch a second Sero instance from desktop host ${hostPid}. Connect to the existing host instead.`;
}

export function seroCdpEndpoint(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.SERO_E2E_EXISTING_CDP?.trim();
  if (!configured) {
    throw new Error('SERO_E2E_EXISTING_CDP must identify the existing Sero host.');
  }
  return /^\d+$/.test(configured) ? `http://127.0.0.1:${configured}` : configured;
}

export async function connectToRunningSero(
  options: { endpoint?: string; slowMo?: number } = {},
): Promise<{ browser: Browser; page: Page }> {
  const endpoint = options.endpoint ?? seroCdpEndpoint();
  const browser = await chromium.connectOverCDP(endpoint, {
    slowMo: options.slowMo,
    timeout: 30_000,
  });
  const pages = browser.contexts().flatMap((context) => context.pages());
  for (const page of pages) {
    const isSero = await page.evaluate(() => Boolean(window.sero?.appControl)).catch(() => false);
    if (isSero) return { browser, page };
  }
  await browser.close();
  throw new Error(`No running Sero renderer was available at ${endpoint}.`);
}

/**
 * Launch the Sero Electron application for e2e testing.
 *
 * Returns the ElectronApplication handle and the first BrowserWindow page.
 * The app is started from the built output in dist/electron/main.mjs.
 *
 * Call `closeSeroApp(app)` in your test teardown.
 */
export async function launchSeroApp(
  options: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const nestedLaunchReason = nestedSeroLaunchReason();
  if (nestedLaunchReason) throw new Error(nestedLaunchReason);

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

  let ownedHome: TempSeroHome | null = null;
  const seroHome = options.seroHome ?? (ownedHome = createTempSeroHome()).path;

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

  for (const key of options.withoutEnv ?? []) {
    delete env[key];
  }

  Object.assign(env, options.env);
  // This variable is only for invoking Electron's embedded Node runtime.
  // Playwright launches the actual Electron application and passes Chromium
  // arguments, so inheriting it makes Electron reject the launch entirely.
  delete env.ELECTRON_RUN_AS_NODE;
  restoreWindowsProfileEnv(env);

  // Opt-in demo/video recording: set SERO_E2E_RECORD_VIDEO=<dir> to capture the
  // whole Electron window to a video (flushed on app.close(); path via
  // page.video()). Off by default, so normal test runs are unaffected.
  // SERO_E2E_SLOWMO=<ms> paces every action for smoother footage.
  const recordVideoDir = options.recordVideoDir ?? process.env.SERO_E2E_RECORD_VIDEO;
  const slowMo = options.slowMo ?? (process.env.SERO_E2E_SLOWMO ? Number(process.env.SERO_E2E_SLOWMO) : undefined);

  let app: ElectronApplication;
  try {
    app = await electron.launch({
      args: [mainEntry],
      cwd: desktopRoot,
      env,
    ...(slowMo ? { slowMo } : {}),
    ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir, size: { width: 1600, height: 1000 } } } : {}),
    });
  } catch (error) {
    ownedHome?.cleanup();
    throw error;
  }

  if (ownedHome) ownedHomes.set(app, ownedHome);

  let page: Page;
  try {
    page = await app.firstWindow();
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
  } catch (error) {
    await closeSeroApp(app).catch(() => undefined);
    throw error;
  }

  return { app, page };
}

export async function closeSeroApp(app: ElectronApplication, timeoutMs = 5_000): Promise<void> {
  try {
    const child = app.process();
    const closeSettled = await withTimeout(app.close(), timeoutMs);
    if (closeSettled) return;

    await killProcessTree(child);
    await waitForProcessExit(child, timeoutMs);
  } finally {
    ownedHomes.get(app)?.cleanup();
    ownedHomes.delete(app);
  }
}

async function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol('timed-out');

  const result = await Promise.race([
    promise.then(() => true, () => true),
    new Promise<typeof timedOut>((resolve) => {
      timeout = setTimeout(() => resolve(timedOut), timeoutMs);
    }),
  ]);

  if (timeout) clearTimeout(timeout);
  return result !== timedOut;
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      execFile('taskkill.exe', ['/pid', String(pid), '/T', '/F'], () => resolve());
    });
    return;
  }

  if (!child.killed) child.kill('SIGKILL');
}

async function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;

  await withTimeout(new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  }), timeoutMs);
}

function isTransientMainProcessEvaluateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Execution context was destroyed')
    || message.includes('most likely because of a navigation');
}

function restoreWindowsProfileEnv(env: Record<string, string>): void {
  if (process.platform !== 'win32') return;
  for (const key of ['USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH'] as const) {
    const value = process.env[key];
    if (value) env[key] = value;
    else delete env[key];
  }
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
