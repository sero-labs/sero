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
import type { ElectronApplication, Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

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
): Promise<boolean> {
  return page.evaluate(
    (o) => window.sero.appControl.recordStart({ fps: o.fps ?? 15, crf: o.crf ?? 20, fullWindow: true }),
    { fps: opts.fps, crf: opts.crf },
  );
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
  segments: Array<{ start: number; end: number; speed: number }>,
): Promise<void> {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  // Fill gaps with 1× segments so the whole timeline is covered.
  const full: Array<{ start: number; end: number; speed: number }> = [];
  let cursor = 0;
  for (const seg of ordered) {
    if (seg.start > cursor) full.push({ start: cursor, end: seg.start, speed: 1 });
    full.push(seg);
    cursor = seg.end;
  }
  full.push({ start: cursor, end: Number.MAX_SAFE_INTEGER, speed: 1 });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-demo-assemble-'));
  const parts: string[] = [];
  try {
    for (let i = 0; i < full.length; i++) {
      const seg = full[i]!;
      const part = path.join(tmpDir, `part-${String(i).padStart(3, '0')}.mp4`);
      const trim = seg.end === Number.MAX_SAFE_INTEGER
        ? ['-ss', String(seg.start)]
        : ['-ss', String(seg.start), '-to', String(seg.end)];
      await execFileAsync('ffmpeg', [
        '-y', ...trim, '-i', rawPath,
        '-vf', `setpts=${(1 / seg.speed).toFixed(4)}*PTS`,
        '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        part,
      ]).catch(() => { /* a zero-length tail segment is fine to skip */ });
      if (fs.existsSync(part) && fs.statSync(part).size > 0) parts.push(part);
    }
    const listFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n'));
    const joined = path.join(tmpDir, 'joined.mp4');
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);
    await encodeYouTube(joined, output);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
