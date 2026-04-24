import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Electron e2e tests.
 *
 * Two projects:
 *   - "ci"    — Containers disabled via SERO_CONTAINER_PROXY=0. Skips
 *               container.spec.ts. Safe for headless CI and environments
 *               without macOS Virtualization.
 *   - "local" — Containers enabled. Full integration tests including
 *               container lifecycle, terminals, file I/O, and port forwarding.
 *
 * Usage:
 *   npm run test:e2e            # Build + CI mode (no containers)
 *   npm run test:e2e:ci         # CI mode only, assumes desktop build already exists
 *   npm run test:e2e:local      # Local mode (with containers)
 *   npm run test:e2e:headed     # Local mode, visible window
 *
 * Or directly:
 *   npx playwright test --project=ci
 *   npx playwright test --project=local
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

  projects: [
    {
      name: 'ci',
      testIgnore: [
        /container\.spec\.ts/,
        // UI-rendering specs — Electron window doesn't fully render in
        // headless CI (elements not found). Run locally with `test:e2e:local`.
        /layout\.spec\.ts/,
        /file-tree\.spec\.ts/,
        /scroll-fix\.spec\.ts/,
      ],
      metadata: { containers: false },
    },
    {
      name: 'local',
      metadata: { containers: true },
    },
  ],
});
