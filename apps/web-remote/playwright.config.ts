import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression for the browser client.
 *
 * The app runs against a gateway stand-in with fixed data, so a
 * screenshot only changes when the interface changes.
 *
 * Baselines are platform-specific: they are generated on the machine
 * that runs them. Run `pnpm e2e:update` after a deliberate change.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Font rasterisation differs by a pixel or two between machines.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },

  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_GATEWAY_URL: 'ws://127.0.0.1:18899',
    },
  },
});
