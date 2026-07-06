/**
 * Proof-of-concept: record the real Sero window using Sero's OWN enhanced
 * recorder (sero app record) via IPC — configurable fps, full-window capture,
 * quality, and an out-of-repo output path. Proves the pipeline for building
 * automated demo videos. Not a polished demo.
 *
 *   SERO_E2E_REAL_HOME=1 SERO_DEMO_OUT=~/Movies/sero-demos \
 *     npx playwright test e2e/demo-record-smoke.agent.spec.ts --project=agent
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers';
import { waitForShell } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
// Default output is OUTSIDE the repo (~/Movies/sero-demos); override with SERO_DEMO_OUT.
const OUT_DIR = process.env.SERO_DEMO_OUT
  ? process.env.SERO_DEMO_OUT.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'Movies', 'sero-demos');

let app: ElectronApplication;
let page: Page;

test.skip(!REAL_HOME, 'needs SERO_E2E_REAL_HOME=1');

test('Sero records its own window to a high-quality MP4 outside the repo', async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'smoke-fullwindow.mp4');
  fs.rmSync(outPath, { force: true });

  ({ app, page } = await launchSeroApp({
    seroHome: path.join(os.homedir(), '.sero-ui'),
    runtime: 'host',
    env: {},
    slowMo: 200,
  }));
  await waitForShell(page);

  // Start Sero's own recorder: 15 fps, whole window, near-lossless quality.
  const started = await page.evaluate(
    (opts) => window.sero.appControl.recordStart(opts),
    { fps: 15, fullWindow: true, crf: 20 },
  );
  expect(started, 'recorder must start').toBe(true);

  // Drive some visible activity so the clip has motion.
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__appControl?.openApp('orchestrator')).catch(() => {});
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.__appControl?.openApp('git')).catch(() => {});
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.__appControl?.openApp('memory')).catch(() => {});
  await page.waitForTimeout(2_500);

  // Stop and encode straight to the out-of-repo path.
  const result = await page.evaluate(
    (dest) => window.sero.appControl.recordStop({ outputPath: dest }),
    outPath,
  );
  expect(result, 'recordStop must return a result').toBeTruthy();
  expect(result!.isVideo, 'must be a real MP4 (ffmpeg present)').toBe(true);
  expect(result!.frameCount, 'high-fps capture should yield many frames').toBeGreaterThan(30);

  await closeSeroApp(app);

  expect(fs.existsSync(outPath), `video at ${outPath}`).toBe(true);
  const bytes = fs.statSync(outPath).size;
  // eslint-disable-next-line no-console
  console.log(`\n\n=== DEMO VIDEO: ${outPath} (${bytes} bytes, ${result!.frameCount} frames, ${Math.round(result!.durationMs / 1000)}s) ===\n`);
  expect(bytes).toBeGreaterThan(50_000);
});
