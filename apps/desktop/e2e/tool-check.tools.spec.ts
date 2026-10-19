/**
 * The tool check (spec `session-tool-surface`): every agent tool action runs
 * for real against a fresh profile and workspace, driven by the stub model.
 *
 * `SERO_E2E_RUNTIME` picks the runtime: host by default, `docker` on Linux or
 * `apple-container` on a Mac.
 */
import { test, expect } from '@playwright/test';
import { startToolCheckApp, type ToolCheckApp } from './helpers/tool-check/app';

let check: ToolCheckApp;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  check = await startToolCheckApp();
});

test.afterAll(async () => {
  await check?.close();
});

test('starts the app with a workspace on the runtime under test', async () => {
  const config = await check.page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), check.workspaceId);
  expect(config.backend).toBe(check.runtime);
});

