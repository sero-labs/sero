/**
 * Proof-of-concept for the demo-capture pipeline: fixed window framing, burned-in
 * captions, Sero's own full-window recorder, and a YouTube-ready 1080p encode
 * written outside the repo. Short flow (open a few apps) so captions/framing/fps
 * can be validated without a full demo run.
 *
 *   SERO_E2E_REAL_HOME=1 npx playwright test e2e/demo-record-smoke.agent.spec.ts --project=agent
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers';
import { waitForShell } from './helpers/workflow';
import { caption, installCaptionOverlay, setDemoWindow, startDemoRecording, stopDemoRecording } from './helpers/demo';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';

let app: ElectronApplication;
let page: Page;

test.skip(!REAL_HOME, 'needs SERO_E2E_REAL_HOME=1');

test('captures a captioned, fixed-frame 1080p demo clip outside the repo', async () => {
  test.setTimeout(180_000);

  ({ app, page } = await launchSeroApp({
    seroHome: path.join(os.homedir(), '.sero-ui'),
    runtime: 'host',
    env: {},
    slowMo: 150,
  }));
  await waitForShell(page);
  await setDemoWindow(app, 1280, 800);
  await installCaptionOverlay(page);

  expect(await startDemoRecording(page, { fps: 15, crf: 20 })).toBe(true);

  await caption(page, 'Sero is a workspace where AI agents come to work', 2_000);
  await page.evaluate(() => window.__appControl?.openApp('orchestrator')).catch(() => {});
  await caption(page, 'Durable loops run real workflows on a schedule', 2_500);
  await page.evaluate(() => window.__appControl?.openApp('git')).catch(() => {});
  await caption(page, 'Source control, terminal, browser — one place', 2_500);
  await page.evaluate(() => window.__appControl?.openApp('memory')).catch(() => {});
  await caption(page, 'And it remembers your projects across sessions', 2_500);

  const out = await stopDemoRecording(page, 'smoke-demo');
  await closeSeroApp(app);

  expect(out, 'a 1080p MP4 must be produced').toBeTruthy();
  expect(fs.existsSync(out!.youtube)).toBe(true);
  const fps = out!.frameCount / (out!.durationMs / 1000);
  // eslint-disable-next-line no-console
  console.log(`\n\n=== DEMO: ${out!.youtube}\n    raw: ${out!.raw}\n    ${out!.frameCount} frames over ${Math.round(out!.durationMs / 1000)}s (~${fps.toFixed(1)} fps) ===\n`);
  expect(fs.statSync(out!.youtube).size).toBeGreaterThan(50_000);
});
