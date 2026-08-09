/**
 * Proof-of-concept for the demo-capture pipeline: fixed window framing, burned-in
 * captions, Sero's own full-window recorder, and a YouTube-ready 1080p encode
 * written outside the repo. Short flow (open a few apps) so captions/framing/fps
 * can be validated without a full demo run.
 *
 *   SERO_E2E_REAL_HOME=1 npx playwright test e2e/demo-record-smoke.agent.spec.ts --project=agent
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchWorkflowApp } from './helpers';
import { waitForShell } from './helpers/workflow';
import {
  caption,
  collectDemoRecorderDiagnostics,
  createDemoInteractionLog,
  demoOutDir,
  installCaptionOverlay,
  openExplorerForDemo,
  setDemoWindow,
  startDemoRecording,
  stopDemoRecording,
  stopRecordingRaw,
  switchExplorerPanelForDemo,
} from './helpers/demo';
import { probeVideo } from './helpers/demo-media';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';

let app: ElectronApplication;
let page: Page;

test.skip(!REAL_HOME, 'needs SERO_E2E_REAL_HOME=1');

test('captures a captioned, fixed-frame 1080p demo clip outside the repo', async () => {
  test.setTimeout(180_000);

  const home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    runtime: 'host',
    slowMo: 150,
  }).catch((error: unknown) => {
    home.cleanup();
    throw error;
  }));
  const interactions = createDemoInteractionLog();
  const evidenceDir = demoOutDir();
  const failedRaw = path.join(evidenceDir, 'smoke-demo-failed-raw.mp4');
  const diagnosticsPath = path.join(evidenceDir, 'smoke-recorder-diagnostics.json');
  let recorderStarted = false;
  let recorderStopped = false;
  let failure: string | null = null;
  let out: Awaited<ReturnType<typeof stopDemoRecording>> = null;

  try {
    await waitForShell(page);
    await setDemoWindow(app, 1280, 800);
    await installCaptionOverlay(page);

    recorderStarted = await startDemoRecording(page, { fps: 15, crf: 20 }, interactions);
    expect(recorderStarted).toBe(true);
    await openExplorerForDemo(page, interactions);
    await switchExplorerPanelForDemo(page, 'explorer', interactions);

    await caption(page, 'Sero keeps files, browser, terminal, and agent work together.', 2_000);
    await switchExplorerPanelForDemo(page, 'browser', interactions);
    await page.screenshot({ path: path.join(evidenceDir, 'smoke-browser.png') });
    await caption(page, 'The visible Browser panel stays inside the workspace.', 2_500);

    await switchExplorerPanelForDemo(page, 'orchestration', interactions);
    await page.screenshot({ path: path.join(evidenceDir, 'smoke-orchestration.png') });
    await caption(page, 'Orchestration shows active agent work.', 2_500);

    await switchExplorerPanelForDemo(page, 'explorer', interactions);
    await page.screenshot({ path: path.join(evidenceDir, 'smoke-explorer.png') });
    await caption(page, 'Every panel switch is a visible, verified interaction.', 2_500);

    expect(interactions.visiblePanels).toEqual(['explorer', 'browser', 'orchestration']);
    // A panel already on screen needs no click, so the visited list alone
    // cannot prove the switches happened on camera. These must be clicked.
    expect(
      interactions.clickedPanels,
      'each demo panel switch must come from a visible, verified click',
    ).toEqual(expect.arrayContaining(['browser', 'orchestration', 'explorer']));
    expect(interactions.visibleClickCount).toBeGreaterThanOrEqual(3);
    out = await stopDemoRecording(page, 'smoke-demo');
    recorderStopped = true;
    const stopped = await collectDemoRecorderDiagnostics(page, 'after clean stop');
    interactions.recorderDiagnostics.push(stopped);
    expect(stopped.recorder.recording).toBe(false);
    expect(stopped.cursor.count).toBe(0);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (recorderStarted && !recorderStopped) {
      await stopRecordingRaw(page, failedRaw).catch(() => null);
    }
    fs.writeFileSync(diagnosticsPath, JSON.stringify({
      savedAt: new Date().toISOString(),
      failure,
      recorderStarted,
      recorderStopped,
      interactions,
    }, null, 2));
    await closeSeroApp(app).catch(() => undefined);
    home.cleanup();
  }

  expect(out, 'a 1080p MP4 must be produced').toBeTruthy();
  expect(fs.existsSync(out!.youtube)).toBe(true);
  const fps = out!.frameCount / (out!.durationMs / 1000);
  const probe = await probeVideo(out!.youtube);
  expect(probe).toMatchObject({ codec: 'h264', pixelFormat: 'yuv420p', height: 1080 });
  expect(fps).toBeGreaterThanOrEqual(10);
  // eslint-disable-next-line no-console
  console.log(`\n\n=== DEMO: ${out!.youtube}\n    raw: ${out!.raw}\n    evidence: ${evidenceDir}/smoke-{browser,orchestration,explorer}.png\n    diagnostics: ${diagnosticsPath}\n    ${out!.frameCount} frames over ${Math.round(out!.durationMs / 1000)}s (~${fps.toFixed(1)} fps) ===\n`);
  expect(fs.statSync(out!.youtube).size).toBeGreaterThan(50_000);
});
