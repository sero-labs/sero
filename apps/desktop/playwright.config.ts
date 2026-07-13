import { defineConfig } from '@playwright/test';

/**
 * Three Playwright projects matching the e2e coverage architecture:
 *
 *   - "contract" — IPC surface, CLI registry, manifest parsing, runtime
 *                  selection. Runs on every PR (GitHub-hosted runners).
 *                  Target wall-clock: ~1–2 min.
 *
 *   - "workflow" — Full user journeys driven through the rendered
 *                  Electron UI. Runs on self-hosted runners per OS via
 *                  workflow_dispatch. Target wall-clock: ~10–15 min.
 *
 *   - "agent"    — Real LLM round-trips on a small set of canonical
 *                  flows. Runs nightly (cheap) and on-demand (full).
 *                  Skipped entirely when SERO_E2E_LLM_MODE=off (default).
 *
 * Spec routing is by filename suffix:
 *   *.contract.spec.ts → contract
 *   *.workflow.spec.ts → workflow
 *   *.agent.spec.ts    → agent
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',

  /* Fail the build on CI if you accidentally left test.only in source. */
  forbidOnly: !!process.env.CI,

  /* Single soft retry on agent flake; contract/workflow only retry on CI. */
  retries: process.env.CI ? 1 : 0,

  /* Electron is single-instance; never parallelise. */
  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],

  /* Container specs need extra time for image pull / boot. */
  timeout: 120_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'contract',
      testMatch: '**/*.contract.spec.ts',
      metadata: { layer: 'contract' },
    },
    {
      name: 'workflow',
      testMatch: '**/*.workflow.spec.ts',
      metadata: { layer: 'workflow' },
    },
    {
      name: 'agent',
      testMatch: '**/*.agent.spec.ts',
      metadata: { layer: 'agent' },
    },
  ],
});
