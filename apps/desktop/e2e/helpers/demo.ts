/**
 * Demo-capture helpers: turn an agent spec into recorded demo footage.
 *
 * - fixed, consistent window framing (smaller window → smoother capture fps);
 * - burned-in captions (a DOM overlay that appears in the full-window capture);
 * - drives Sero's own recorder (sero app record) at demo quality;
 * - encodes a YouTube-ready 1080p MP4 outside the repo.
 *
 * Captions work because full-window recording captures the rendered DOM, so an
 * injected fixed-position overlay shows up in every frame.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import type { AppRecordingStatus } from '../../src/types/app-control';
import {
  probeVideo,
  validateSpeedSegments,
  withBoundedRetries,
  type DemoSpeedSegment,
} from './demo-media';

const execFileAsync = promisify(execFile);

export {
  CAMPAIGN_CLIPS,
  createReviewContactSheet,
  formatElapsed,
  validateDemoVideo,
  withBoundedRetries,
} from './demo-media';
export type { CampaignClipId, CampaignClipProfile, DemoValidation } from './demo-media';

export type DemoExplorerPanel = 'explorer' | 'browser' | 'orchestration';

export interface DemoRecorderDiagnostics {
  label: string;
  capturedAt: string;
  recorder: AppRecordingStatus;
  cursor: { count: number; visible: boolean; transform: string };
  focus: { documentHasFocus: boolean; visibilityState: DocumentVisibilityState };
}

export interface DemoInteractionLog {
  visibleClickCount: number;
  visiblePanels: DemoExplorerPanel[];
  recorderDiagnostics: DemoRecorderDiagnostics[];
}

export function createDemoInteractionLog(): DemoInteractionLog {
  return { visibleClickCount: 0, visiblePanels: [], recorderDiagnostics: [] };
}

export async function collectDemoRecorderDiagnostics(
  page: Page,
  label: string,
): Promise<DemoRecorderDiagnostics> {
  const [recorder, renderer] = await Promise.all([
    page.evaluate(() => window.sero.appControl.recordStatus()),
    page.evaluate(() => {
      const cursor = document.querySelector<HTMLElement>('[data-sero-recording-cursor]');
      return {
        cursor: {
          count: document.querySelectorAll('[data-sero-recording-cursor]').length,
          visible: cursor ? getComputedStyle(cursor).display !== 'none' : false,
          transform: cursor?.style.transform ?? '',
        },
        focus: {
          documentHasFocus: document.hasFocus(),
          visibilityState: document.visibilityState,
        },
      };
    }),
  ]);
  return {
    label,
    capturedAt: new Date().toISOString(),
    recorder,
    cursor: renderer.cursor,
    focus: renderer.focus,
  };
}

/** Output dir OUTSIDE the repo. Override with SERO_DEMO_OUT. */
export function demoOutDir(): string {
  const raw = process.env.SERO_DEMO_OUT;
  const dir = raw ? raw.replace(/^~/, os.homedir()) : path.join(os.homedir(), 'Movies', 'sero-demos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Pin the window to a fixed CSS size (smaller = cheaper capture = higher fps).
 * 1280×800 CSS ≈ a comfortable 16:10 demo frame; Retina captures it at 2×.
 */
export async function setDemoWindow(app: ElectronApplication, width = 1280, height = 800): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    win.setResizable(true);
    win.setContentSize(size.width, size.height);
  }, { width, height });
}

/** Inject the caption overlay (call once after the shell is ready). */
export async function installCaptionOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('__demo_caption')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__demo_caption {
        position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%);
        max-width: 80%; padding: 14px 26px; border-radius: 14px;
        background: rgba(10,10,12,0.82); color: #fff; z-index: 2147483647;
        font: 500 22px/1.35 -apple-system, system-ui, sans-serif; text-align: center;
        letter-spacing: 0.2px; box-shadow: 0 8px 40px rgba(0,0,0,0.45);
        opacity: 0; transition: opacity 320ms ease; pointer-events: none;
        backdrop-filter: blur(8px);
      }
      #__demo_caption.show { opacity: 1; }
    `;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = '__demo_caption';
    document.body.appendChild(el);
  });
}

/** Install a truthful wall-clock timer that remains visible through real-time capture. */
export async function installElapsedOverlay(page: Page, startedAt = Date.now()): Promise<void> {
  await page.evaluate((start) => {
    document.getElementById('__demo_elapsed')?.remove();
    const el = document.createElement('div');
    el.id = '__demo_elapsed';
    el.style.cssText = [
      'position:fixed', 'right:24px', 'top:52px', 'z-index:2147483647',
      'padding:8px 12px', 'border-radius:8px', 'background:rgba(10,10,12,.86)',
      'color:#fff', 'font:600 18px/1.2 ui-monospace,SFMono-Regular,monospace',
      'pointer-events:none', 'font-variant-numeric:tabular-nums',
    ].join(';');
    const render = () => {
      const totalSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      el.textContent = `ELAPSED ${minutes}:${seconds}`;
    };
    document.body.appendChild(el);
    render();
    const timer = window.setInterval(render, 250);
    el.dataset.timer = String(timer);
  }, startedAt);
}

export async function removeElapsedOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('__demo_elapsed');
    if (!el) return;
    window.clearInterval(Number(el.dataset.timer));
    el.remove();
  });
}

interface DemoClickOptions {
  name?: string;
  timeoutMs?: number;
}

/** Click a visible control and verify the recorder's cursor and blue pulse. */
export async function clickForDemo(
  page: Page,
  target: Locator,
  log: DemoInteractionLog,
  options: DemoClickOptions = {},
): Promise<void> {
  const name = options.name ?? 'Demo interaction target';
  const timeout = options.timeoutMs ?? 5_000;
  await target.waitFor({ state: 'visible', timeout }).catch(() => {
    throw new Error(`${name} was not visible within ${timeout}ms.`);
  });
  const box = await target.boundingBox();
  if (!box) throw new Error(`${name} has no visible bounding box.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const diagnostics = await collectDemoRecorderDiagnostics(page, `before click: ${name}`);
  log.recorderDiagnostics.push(diagnostics);
  if (!diagnostics.recorder.ready || !diagnostics.cursor.visible) {
    throw new Error(`Sero recorder was not ready before clicking ${name}. ${JSON.stringify(diagnostics)}`);
  }
  await target.click({ timeout });
  const pulseVisible = await page.locator('[data-sero-recording-click]').count();
  if (pulseVisible < 1) throw new Error(`Sero recording click pulse did not appear after clicking ${name}.`);
  log.visibleClickCount += 1;
}

const panelLabels: Record<DemoExplorerPanel, string> = {
  explorer: 'Explorer',
  browser: 'Browser',
  orchestration: 'Orchestration',
};

function explorerActivityBar(page: Page): Locator {
  return page.locator('[data-testid="active-app-panel"]').getByRole('navigation');
}

function explorerPanelEvidence(page: Page, panel: DemoExplorerPanel): Locator {
  const activePanel = page.locator('[data-testid="active-app-panel"]');
  const sidebar = page.locator('[data-testid="explorer-sidebar-content"]');
  if (panel === 'explorer') return sidebar.locator('[data-testid="file-tree"]');
  if (panel === 'browser') {
    return activePanel.locator('[data-testid="browser-viewport"]').or(
      activePanel.getByText('No browser tabs open in this workspace', { exact: true }),
    );
  }
  return sidebar.getByText('Orchestration', { exact: true }).first();
}

async function navigationDiagnostics(page: Page): Promise<string> {
  const activePanel = page.locator('[data-testid="active-app-panel"]');
  const activeText = await activePanel.innerText({ timeout: 1_000 }).catch(() => '<unavailable>');
  const visibleButtons = await activePanel.getByRole('button').allTextContents().catch(() => []);
  const recorder = await collectDemoRecorderDiagnostics(page, 'navigation failure').catch(() => null);
  return [
    `active text: ${activeText.replace(/\s+/g, ' ').slice(0, 240) || '<empty>'}`,
    `active buttons: ${visibleButtons.map((text) => text.trim()).filter(Boolean).join(', ') || '<icon-only or none>'}`,
    `recorder: ${recorder ? JSON.stringify(recorder) : '<unavailable>'}`,
  ].join('; ');
}

/** Open Explorer through the visible main sidebar when another app is active. */
export async function openExplorerForDemo(page: Page, log: DemoInteractionLog): Promise<void> {
  try {
    await withBoundedRetries(async () => {
      if (await explorerActivityBar(page).isVisible()) return true;

      const sidebarPanel = page.locator('[data-testid="main-sidebar-panel"]');
      const explorerButton = sidebarPanel.getByRole('button', { name: 'Explorer', exact: true });
      if (!(await explorerButton.isVisible())) {
        await clickForDemo(
          page,
          page.getByRole('button', { name: 'Toggle sidebar', exact: true }),
          log,
          { name: 'Toggle sidebar' },
        );
      }
      await clickForDemo(page, explorerButton, log, { name: 'Explorer app' });
      await explorerActivityBar(page).waitFor({ state: 'visible', timeout: 5_000 });
      return true;
    }, { attempts: 3, delayMs: 500 });
  } catch (error) {
    const details = await navigationDiagnostics(page);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not open Explorer through visible UI. ${message} Diagnostics: ${details}`);
  }
}

/** Switch Explorer panels through the labelled activity bar with bounded retries. */
export async function switchExplorerPanelForDemo(
  page: Page,
  panel: DemoExplorerPanel,
  log: DemoInteractionLog,
): Promise<void> {
  const label = panelLabels[panel];
  const evidence = explorerPanelEvidence(page, panel);
  try {
    await withBoundedRetries(async () => {
      if (await evidence.isVisible()) return true;
      const button = explorerActivityBar(page).getByRole('button', { name: label, exact: true });
      await clickForDemo(page, button, log, { name: `${label} panel` });
      await evidence.waitFor({ state: 'visible', timeout: 5_000 });
      return true;
    }, { attempts: 3, delayMs: 500 });
    if (!log.visiblePanels.includes(panel)) log.visiblePanels.push(panel);
  } catch (error) {
    const details = await navigationDiagnostics(page);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not switch to the ${label} panel through visible UI. ${message} Diagnostics: ${details}`);
  }
}

/** Show a caption; leaves it up until the next call or clearCaption(). */
export async function caption(page: Page, text: string, holdMs = 0): Promise<void> {
  await page.evaluate((t) => {
    const el = document.getElementById('__demo_caption');
    if (!el) return;
    el.textContent = t;
    el.classList.add('show');
  }, text);
  if (holdMs > 0) await page.waitForTimeout(holdMs);
}

export async function clearCaption(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('__demo_caption')?.classList.remove('show'));
}

/** Start Sero's own recorder at demo quality (full window). */
export async function startDemoRecording(
  page: Page,
  opts: { fps?: number; crf?: number } = {},
  log?: DemoInteractionLog,
): Promise<boolean> {
  const started = await page.evaluate(
    (o) => window.sero.appControl.recordStart({ fps: o.fps ?? 15, crf: o.crf ?? 20, fullWindow: true }),
    { fps: opts.fps, crf: opts.crf },
  );
  if (!started) return false;

  let latest: DemoRecorderDiagnostics | null = null;
  await withBoundedRetries(async (attempt) => {
    latest = await collectDemoRecorderDiagnostics(page, `startup readiness attempt ${attempt}`);
    log?.recorderDiagnostics.push(latest);
    return latest;
  }, {
    attempts: 3,
    delayMs: 250,
    accept: (diagnostics) => Boolean(
      diagnostics.recorder.recording && diagnostics.recorder.ready && diagnostics.cursor.visible,
    ),
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Sero recorder did not become ready. ${message} Last diagnostics: ${JSON.stringify(latest)}`);
  });
  return true;
}

/**
 * Stop recording, write the raw MP4, then encode a YouTube-ready 1080p variant
 * (H.264, yuv420p, faststart) next to it. Returns both paths.
 */
export async function stopDemoRecording(
  page: Page,
  baseName: string,
): Promise<{ raw: string; youtube: string; frameCount: number; durationMs: number } | null> {
  const dir = demoOutDir();
  const raw = path.join(dir, `${baseName}-raw.mp4`);
  const result = await page.evaluate((dest) => window.sero.appControl.recordStop({ outputPath: dest }), raw);
  if (!result?.isVideo) return null;

  const youtube = path.join(dir, `${baseName}-1080p.mp4`);
  await encodeYouTube(raw, youtube);
  return { raw, youtube, frameCount: result.frameCount, durationMs: result.durationMs };
}

/** Stop recording and write the raw MP4 only (no encode). For multi-segment demos. */
export async function stopRecordingRaw(
  page: Page,
  outputPath: string,
): Promise<{ frameCount: number; durationMs: number } | null> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = await page.evaluate((dest) => window.sero.appControl.recordStop({ outputPath: dest }), outputPath);
  return result?.isVideo ? { frameCount: result.frameCount, durationMs: result.durationMs } : null;
}

/** A solid title card with centered text (transition between segments). */
export async function titleCard(text: string, seconds: number, output: string): Promise<void> {
  const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
  const safe = text.replace(/'/g, "’").replace(/:/g, '\\:');
  await execFileAsync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `color=c=0x0a0a0c:s=1920x1200:d=${seconds}:r=30`,
    '-vf', `drawtext=fontfile=${font}:text='${safe}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', output,
  ]);
}

/** Normalise clips to a common format, concatenate in order, and encode 1080p. */
export async function concatDemo(parts: string[], output: string): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-demo-concat-'));
  try {
    const normalised: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const norm = path.join(tmpDir, `n-${String(i).padStart(3, '0')}.mp4`);
      await execFileAsync('ffmpeg', [
        '-y', '-i', parts[i]!,
        '-vf', 'scale=-2:1080:flags=lanczos,setsar=1', '-r', '30',
        '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', norm,
      ]);
      normalised.push(norm);
    }
    const listFile = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(listFile, normalised.map((p) => `file '${p}'`).join('\n'));
    const joined = path.join(tmpDir, 'joined.mp4');
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);
    await execFileAsync('ffmpeg', [
      '-y', '-i', joined, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', output,
    ]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Scale any clip to a YouTube-ready 1080p H.264 MP4. */
export async function encodeYouTube(input: string, output: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y', '-i', input,
    '-vf', 'scale=-2:1080:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', '30', '-movflags', '+faststart',
    output,
  ]);
}

/**
 * Assemble a paced demo from a raw recording by speeding up chosen time ranges
 * (e.g. a multi-minute build) while keeping the rest real-time, then encoding
 * to 1080p. `segments` cover the timeline in order; gaps play at 1×.
 * Times are seconds from the start of the recording.
 */
export async function assembleDemo(
  rawPath: string,
  output: string,
  segments: DemoSpeedSegment[],
): Promise<void> {
  const duration = (await probeVideo(rawPath)).durationSeconds;
  const segmentErrors = validateSpeedSegments(segments, duration);
  if (segmentErrors.length > 0) throw new Error(segmentErrors.join('\n'));

  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const full: DemoSpeedSegment[] = [];
  let cursor = 0;
  for (const segment of ordered) {
    if (segment.start > cursor) full.push({ start: cursor, end: segment.start, speed: 1 });
    full.push(segment);
    cursor = segment.end;
  }
  if (cursor < duration) full.push({ start: cursor, end: duration, speed: 1 });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-demo-assemble-'));
  const parts: string[] = [];
  try {
    for (let i = 0; i < full.length; i += 1) {
      const segment = full[i]!;
      const part = path.join(tmpDir, `part-${String(i).padStart(3, '0')}.mp4`);
      // Timelapse and elapsed labels are captured in the visible DOM. Keeping
      // text out of ffmpeg works with the minimal release encoder on every OS.
      await execFileAsync('ffmpeg', [
        '-y', '-ss', String(segment.start), '-to', String(segment.end), '-i', rawPath,
        '-vf', `setpts=${(1 / segment.speed).toFixed(4)}*PTS`, '-an', '-c:v', 'libx264', '-preset', 'fast',
        '-crf', '20', '-pix_fmt', 'yuv420p', part,
      ]);
      parts.push(part);
    }
    const listFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(listFile, parts.map((part) => `file '${part}'`).join('\n'));
    const joined = path.join(tmpDir, 'joined.mp4');
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);
    await encodeYouTube(joined, output);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
