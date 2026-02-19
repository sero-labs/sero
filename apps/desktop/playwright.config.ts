import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Electron e2e tests.
 *
 * Tests launch the built Electron app directly via `_electron.launch()`,
 * so no webServer is needed. The app must be built first:
 *
 *   npm run build && npx playwright test
 *
 * Or use the convenience script:
 *
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry once on CI only — flaky Electron startup is common. */
  retries: process.env.CI ? 1 : 0,

  /* Single worker — Electron tests share one app instance per test file. */
  workers: 1,

  /* Reporter */
  reporter: process.env.CI ? 'github' : 'list',

  /* Generous timeout for Electron startup + IPC initialization. */
  timeout: 60_000,

  /* Expect timeout */
  expect: {
    timeout: 10_000,
  },

  use: {
    /* Trace on first retry for debugging CI failures. */
    trace: 'on-first-retry',

    /* Screenshots on failure. */
    screenshot: 'only-on-failure',
  },

  /* No projects needed — Electron tests always run against the desktop app. */
});
