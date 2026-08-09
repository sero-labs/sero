/**
 * ffmpeg assembly for demo footage: title cards, concatenation, YouTube-ready
 * 1080p encodes, and paced timelapse assembly from one raw recording.
 *
 * Kept apart from `demo.ts` so the in-app driving helpers stay readable.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { probeVideo, validateSpeedSegments, type DemoSpeedSegment } from './demo-media';

const execFileAsync = promisify(execFile);

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
