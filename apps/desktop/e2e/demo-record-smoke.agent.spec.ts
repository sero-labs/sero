/**
 * Proof-of-concept: record the real Sero window to a video via Playwright's
 * built-in recordVideo. Not a demo — just proves the capture pipeline produces
 * a playable file, so the flagship/loop specs can be turned into demo footage.
 *
 *   SERO_E2E_REAL_HOME=1 SERO_E2E_RECORD_VIDEO=$PWD/e2e/demo-videos \
 *     npx playwright test e2e/demo-record-smoke.agent.spec.ts --project=agent
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers';
import { waitForShell } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const VIDEO_DIR = process.env.SERO_E2E_RECORD_VIDEO ?? path.resolve(__dirname, 'demo-videos');

let app: ElectronApplication;
let page: Page;
let videoPath: string | undefined;

test.skip(!REAL_HOME, 'needs SERO_E2E_REAL_HOME=1');

test('records the Sero window to a video file', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  ({ app, page } = await launchSeroApp({
    seroHome: path.join(os.homedir(), '.sero-ui'),
    runtime: 'host',
    env: {},
    recordVideoDir: VIDEO_DIR,
    slowMo: 250,
  }));
  await waitForShell(page);

  // A few seconds of visible activity so the clip isn't blank.
  videoPath = await page.video()?.path();
  await page.waitForTimeout(4_000);
  await page.evaluate(() => window.__appControl?.openApp('git')).catch(() => {});
  await page.waitForTimeout(3_000);
  await page.evaluate(() => window.__appControl?.openApp('orchestrator')).catch(() => {});
  await page.waitForTimeout(4_000);

  // Video is flushed to disk on close.
  await closeSeroApp(app);

  expect(videoPath, 'Playwright must report a video path').toBeTruthy();
  await expect.poll(() => (videoPath && fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0), {
    timeout: 30_000,
    intervals: [1_000],
  }).toBeGreaterThan(10_000);
  // eslint-disable-next-line no-console
  console.log(`\n\n=== DEMO VIDEO WRITTEN: ${videoPath} (${fs.statSync(videoPath!).size} bytes) ===\n`);
});
