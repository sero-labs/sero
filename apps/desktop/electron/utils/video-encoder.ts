/**
 * Video encoder — stitches PNG frames into an MP4 using ffmpeg.
 *
 * Requires ffmpeg on the system PATH. Falls back to returning the
 * frames directory if ffmpeg is unavailable.
 */

import { spawn, execFile } from 'child_process';
import { writeFile, mkdir, unlink, readdir, rmdir } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

interface EncodeOptions {
  /** PNG frames as base64 strings. */
  frames: Array<{ timestamp: number; base64: string }>;
  /** Target FPS (default: 2). */
  fps?: number;
  /** Output path. Defaults to /tmp/sero-recordings/video-<ts>.mp4. */
  outputPath?: string;
}

interface EncodeResult {
  /** Absolute path to the MP4 file (or frames directory as fallback). */
  path: string;
  /** Whether the result is an actual MP4 (true) or fallback frames dir (false). */
  isVideo: boolean;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Number of frames. */
  frameCount: number;
}

/** Check whether ffmpeg is available on the system. */
export async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (err: Error | null) => resolve(!err));
  });
}

/**
 * Encode PNG frames into an MP4 video.
 *
 * Writes frames to a temp directory, pipes them through ffmpeg with
 * H.264 encoding, then cleans up the temp frames.
 */
export async function encodeFramesToMp4(opts: EncodeOptions): Promise<EncodeResult> {
  const { frames, fps = 2 } = opts;
  if (frames.length === 0) {
    throw new Error('No frames to encode');
  }

  const durationMs = frames[frames.length - 1]!.timestamp - frames[0]!.timestamp;
  const ts = Date.now();
  const workDir = path.join(tmpdir(), 'sero-recordings', `work-${ts}`);
  await mkdir(workDir, { recursive: true });

  // Write frames to disk as numbered PNGs
  for (let i = 0; i < frames.length; i++) {
    const framePath = path.join(workDir, `frame-${String(i).padStart(5, '0')}.png`);
    await writeFile(framePath, Buffer.from(frames[i]!.base64, 'base64'));
  }

  const outputDir = path.join(tmpdir(), 'sero-recordings');
  await mkdir(outputDir, { recursive: true });
  const outputPath = opts.outputPath ?? path.join(outputDir, `video-${ts}.mp4`);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const ffmpegAvailable = await hasFfmpeg();
  if (!ffmpegAvailable) {
    // Fallback: keep frames as-is, write metadata
    await writeFile(path.join(workDir, 'metadata.json'), JSON.stringify({
      frameCount: frames.length,
      startedAt: frames[0]!.timestamp,
      endedAt: frames[frames.length - 1]!.timestamp,
      durationMs,
      fps,
      note: 'ffmpeg not available — frames saved as PNGs. Install ffmpeg to get MP4 output.',
    }, null, 2));
    return { path: workDir, isVideo: false, durationMs, frameCount: frames.length };
  }

  // Encode with ffmpeg: PNG sequence → H.264 MP4
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',                                     // overwrite output
      '-framerate', String(fps),                // input framerate
      '-i', path.join(workDir, 'frame-%05d.png'), // input pattern
      '-c:v', 'libx264',                        // H.264 codec
      '-preset', 'fast',                        // encoding speed
      '-crf', '23',                             // quality (lower = better)
      '-pix_fmt', 'yuv420p',                    // broad compatibility
      '-movflags', '+faststart',                // web-friendly seeking
      outputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err: Error) => reject(err));
  });

  // Clean up temp frames
  try {
    const files = await readdir(workDir);
    await Promise.all(files.map((f) => unlink(path.join(workDir, f))));
    await rmdir(workDir);
  } catch {
    // Non-critical cleanup failure
  }

  return { path: outputPath, isVideo: true, durationMs, frameCount: frames.length };
}
