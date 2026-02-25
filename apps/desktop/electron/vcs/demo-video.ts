/**
 * Demo video generation for pull requests.
 *
 * Generates an animated walkthrough video from a PR's diff context:
 * 1. Renders each changed file's diff as an annotated HTML page
 * 2. Captures frames via Electron's offscreen BrowserWindow
 * 3. Encodes frames into a WebM video
 * 4. Returns the video file path for upload
 *
 * The video shows each changed file with syntax-highlighted diffs,
 * file path headers, and change type badges — cycling through files
 * with smooth transitions.
 */

import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

import type { GitRunner } from './git-runner';
import type { FileDiffEntry } from '../../src/types/vcs';

export interface DemoVideoOptions {
  workspaceId: string;
  sourceBranch: string;
  targetBranch: string;
  comparisonBase: string;
  files: FileDiffEntry[];
  /** Milliseconds each file frame is shown. Default 3000. */
  frameDurationMs?: number;
}

export interface DemoVideoResult {
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const DEFAULT_FRAME_DURATION_MS = 3000;
const MAX_FILES_IN_VIDEO = 20;
const MAX_DIFF_LINES = 60;

/**
 * Generate a demo video showing the PR's changed files.
 */
export async function generateDemoVideo(
  runner: GitRunner,
  options: DemoVideoOptions,
): Promise<DemoVideoResult> {
  const {
    workspaceId,
    sourceBranch,
    comparisonBase,
    files,
    frameDurationMs = DEFAULT_FRAME_DURATION_MS,
  } = options;

  const filesToShow = files.slice(0, MAX_FILES_IN_VIDEO);

  // Collect diffs for each file
  const fileDiffs = await collectFileDiffs(runner, workspaceId, comparisonBase, sourceBranch, filesToShow);

  // Generate the animated HTML page
  const html = buildDemoHtml(fileDiffs, options, frameDurationMs);

  // Capture frames via offscreen BrowserWindow
  const frames = await captureFrames(html, fileDiffs.length, frameDurationMs);

  // Encode frames to WebM
  const videoPath = await encodeVideo(frames, frameDurationMs);

  const stat = await fs.stat(videoPath);
  return {
    filePath: videoPath,
    fileName: `demo-${sourceBranch.replace(/[^a-zA-Z0-9-]/g, '-')}.webm`,
    mimeType: 'video/webm',
    sizeBytes: stat.size,
  };
}

interface FileDiff {
  file: FileDiffEntry;
  diff: string;
}

async function collectFileDiffs(
  runner: GitRunner,
  workspaceId: string,
  base: string,
  head: string,
  files: FileDiffEntry[],
): Promise<FileDiff[]> {
  const results: FileDiff[] = [];
  for (const file of files) {
    const result = await runner.run(workspaceId, [
      'diff',
      `${base}..${head}`,
      '--',
      file.path,
    ]);
    const diffText = result.exitCode === 0 ? truncateDiff(result.stdout) : '(diff unavailable)';
    results.push({ file, diff: diffText });
  }
  return results;
}

function truncateDiff(diff: string): string {
  const lines = diff.split('\n');
  if (lines.length <= MAX_DIFF_LINES) return diff;
  return lines.slice(0, MAX_DIFF_LINES).join('\n') + '\n... (truncated)';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status: FileDiffEntry['status']): { label: string; color: string } {
  switch (status) {
    case 'added': return { label: 'ADDED', color: '#22c55e' };
    case 'deleted': return { label: 'DELETED', color: '#ef4444' };
    case 'renamed': return { label: 'RENAMED', color: '#a855f7' };
    case 'copied': return { label: 'COPIED', color: '#06b6d4' };
    default: return { label: 'MODIFIED', color: '#3b82f6' };
  }
}

function buildDemoHtml(
  fileDiffs: FileDiff[],
  options: DemoVideoOptions,
  frameDurationMs: number,
): string {
  const totalDuration = fileDiffs.length * frameDurationMs;
  const { sourceBranch, targetBranch } = options;

  const slidesCss = fileDiffs.map((_, i) => {
    const startPct = (i / fileDiffs.length) * 100;
    const endPct = ((i + 1) / fileDiffs.length) * 100;
    const fadeIn = startPct;
    const fadeInDone = startPct + 2;
    const fadeOut = endPct - 2;
    const fadeOutDone = endPct;
    return `.slide-${i} {
      opacity: 0;
      animation: slide${i} ${totalDuration}ms linear infinite;
    }
    @keyframes slide${i} {
      0%, ${fadeIn}% { opacity: 0; }
      ${fadeInDone}% { opacity: 1; }
      ${fadeOut}% { opacity: 1; }
      ${fadeOutDone}%, 100% { opacity: 0; }
    }`;
  }).join('\n');

  const slides = fileDiffs.map((fd, i) => {
    const badge = statusBadge(fd.file.status);
    const diffLines = fd.diff.split('\n').map((line) => {
      let lineClass = 'diff-ctx';
      if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'diff-add';
      else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'diff-del';
      else if (line.startsWith('@@')) lineClass = 'diff-hunk';
      return `<span class="${lineClass}">${escapeHtml(line)}</span>`;
    }).join('\n');

    return `<div class="slide slide-${i}">
      <div class="slide-header">
        <span class="file-path">${escapeHtml(fd.file.path)}</span>
        <span class="badge" style="background:${badge.color}">${badge.label}</span>
        <span class="counter">${i + 1} / ${fileDiffs.length}</span>
      </div>
      <pre class="diff-block"><code>${diffLines}</code></pre>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${FRAME_WIDTH}px;
    height: ${FRAME_HEIGHT}px;
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .title-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 56px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 12px;
    z-index: 10;
  }
  .title-bar .logo {
    font-size: 18px;
    font-weight: 700;
    color: #58a6ff;
  }
  .title-bar .branch-info {
    font-size: 13px;
    color: #8b949e;
  }
  .title-bar .branch-name {
    color: #58a6ff;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    background: #1f2937;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .slide {
    position: absolute;
    top: 56px; left: 0; right: 0; bottom: 0;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
  }
  .slide-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }
  .file-path {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 15px;
    font-weight: 600;
    color: #e6edf3;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .counter {
    margin-left: auto;
    font-size: 12px;
    color: #8b949e;
  }
  .diff-block {
    flex: 1;
    overflow: hidden;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre;
  }
  .diff-add { color: #3fb950; background: rgba(46,160,67,0.15); display: inline-block; width: 100%; }
  .diff-del { color: #f85149; background: rgba(248,81,73,0.15); display: inline-block; width: 100%; }
  .diff-hunk { color: #79c0ff; font-style: italic; display: inline-block; width: 100%; }
  .diff-ctx { color: #8b949e; display: inline-block; width: 100%; }
  ${slidesCss}
</style>
</head>
<body>
  <div class="title-bar">
    <span class="logo">Sero</span>
    <span class="branch-info">Demo: </span>
    <span class="branch-name">${escapeHtml(sourceBranch)}</span>
    <span class="branch-info">→</span>
    <span class="branch-name">${escapeHtml(targetBranch)}</span>
  </div>
  ${slides}
</body>
</html>`;
}

async function captureFrames(
  html: string,
  slideCount: number,
  frameDurationMs: number,
): Promise<Buffer[]> {
  // Use offscreen rendering to capture frames
  const win = new BrowserWindow({
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
    },
  });

  const frames: Buffer[] = [];

  try {
    // Load the HTML content
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for initial render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Capture frames at regular intervals
    // We capture 2 frames per slide for smoother video (at transition and stable)
    const fps = 2;
    const totalFrames = slideCount * fps;
    const captureInterval = frameDurationMs / fps;

    for (let i = 0; i < totalFrames; i++) {
      const image = await win.webContents.capturePage();
      const pngBuffer = image.toPNG();
      frames.push(pngBuffer);

      if (i < totalFrames - 1) {
        await new Promise((resolve) => setTimeout(resolve, captureInterval));
      }
    }
  } finally {
    win.destroy();
  }

  return frames;
}

/**
 * Encode PNG frames to a WebM video file.
 *
 * Uses a hidden BrowserWindow with canvas + MediaRecorder to produce
 * a WebM VP8/VP9 video from the captured PNG frames.
 */
async function encodeVideo(frames: Buffer[], frameDurationMs: number): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), 'sero-demo-video');
  await fs.mkdir(tmpDir, { recursive: true });

  const videoId = crypto.randomUUID();
  const outputPath = path.join(tmpDir, `${videoId}.webm`);

  // Write frames to temp files so the encoder window can access them
  const framePaths: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const framePath = path.join(tmpDir, `${videoId}-frame-${i}.png`);
    await fs.writeFile(framePath, frames[i]);
    framePaths.push(framePath);
  }

  // Use a hidden BrowserWindow to run MediaRecorder
  const encoderHtml = buildEncoderHtml(framePaths, frameDurationMs);

  const encoderWin = new BrowserWindow({
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    const videoData = await new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video encoding timed out')), 60_000);

      encoderWin.webContents.on('console-message', (_event, _level, message) => {
        if (message.startsWith('VIDEO_READY:')) {
          clearTimeout(timeout);
          const base64 = message.slice('VIDEO_READY:'.length);
          resolve(Buffer.from(base64, 'base64'));
        } else if (message.startsWith('VIDEO_ERROR:')) {
          clearTimeout(timeout);
          reject(new Error(message.slice('VIDEO_ERROR:'.length)));
        }
      });

      encoderWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(encoderHtml)}`);
    });

    await fs.writeFile(outputPath, videoData);
  } finally {
    encoderWin.destroy();
    // Clean up frame files
    for (const fp of framePaths) {
      await fs.unlink(fp).catch(() => {});
    }
  }

  return outputPath;
}

function buildEncoderHtml(framePaths: string[], frameDurationMs: number): string {
  const frameInterval = frameDurationMs / 2; // 2 frames per slide
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<canvas id="canvas" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}"></canvas>
<script>
(async () => {
  try {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const framePaths = ${JSON.stringify(framePaths)};
    const frameInterval = ${frameInterval};

    // Load all frame images
    const images = [];
    for (const fp of framePaths) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = 'file://' + fp;
      });
      images.push(img);
    }

    // Set up MediaRecorder
    const stream = canvas.captureStream(0); // 0 = manual frame control
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 2_000_000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      console.log('VIDEO_READY:' + base64);
    };

    recorder.start();

    // Draw each frame
    for (let i = 0; i < images.length; i++) {
      ctx.clearRect(0, 0, ${FRAME_WIDTH}, ${FRAME_HEIGHT});
      ctx.drawImage(images[i], 0, 0, ${FRAME_WIDTH}, ${FRAME_HEIGHT});
      stream.getVideoTracks()[0].requestFrame();
      await new Promise(r => setTimeout(r, frameInterval));
    }

    recorder.stop();
  } catch (err) {
    console.log('VIDEO_ERROR:' + err.message);
  }
})();
</script>
</body>
</html>`;
}
