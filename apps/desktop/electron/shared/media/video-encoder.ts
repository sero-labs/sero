/**
 * Video encoder — stitches PNG frames into an MP4 using ffmpeg.
 *
 * Requires ffmpeg on the system PATH. Falls back to returning the
 * frames directory if ffmpeg is unavailable or encoding fails.
 */

import { spawn, execFile } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
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

const MAX_FALLBACK_NOTE_CHARS = 1_000;

/** Check whether ffmpeg is available on the system. */
async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (err: Error | null) => resolve(!err));
  });
}

function getFramesDir(outputPath: string): string {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}-frames`);
}

async function writeFrames(
  targetDir: string,
  frames: EncodeOptions['frames'],
): Promise<void> {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  for (let i = 0; i < frames.length; i++) {
    const framePath = path.join(targetDir, `frame-${String(i).padStart(5, '0')}.png`);
    await writeFile(framePath, Buffer.from(frames[i]!.base64, 'base64'));
  }
}

function trimFallbackNote(note: string): string {
  return note.length <= MAX_FALLBACK_NOTE_CHARS
    ? note
    : `${note.slice(0, MAX_FALLBACK_NOTE_CHARS)}…`;
}

async function writeFramesFallback(opts: {
  frames: EncodeOptions['frames'];
  durationMs: number;
  fps: number;
  outputPath?: string;
  note: string;
}): Promise<EncodeResult> {
  const { frames, durationMs, fps, outputPath, note } = opts;
  const ts = Date.now();
  const framesDir = outputPath
    ? getFramesDir(outputPath)
    : path.join(tmpdir(), 'sero-recordings', `frames-${ts}`);

  await writeFrames(framesDir, frames);
  await writeFile(path.join(framesDir, 'metadata.json'), JSON.stringify({
    frameCount: frames.length,
    startedAt: frames[0]!.timestamp,
    endedAt: frames[frames.length - 1]!.timestamp,
    durationMs,
    fps,
    note: trimFallbackNote(note),
  }, null, 2));

  return { path: framesDir, isVideo: false, durationMs, frameCount: frames.length };
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
  const ffmpegAvailable = await hasFfmpeg();
  if (!ffmpegAvailable) {
    return writeFramesFallback({
      frames,
      durationMs,
      fps,
      outputPath: opts.outputPath,
      note: 'ffmpeg not available — frames saved as PNGs. Install ffmpeg to get MP4 output.',
    });
  }

  const workDir = path.join(tmpdir(), 'sero-recordings', `work-${ts}`);
  await writeFrames(workDir, frames);

  const outputDir = path.join(tmpdir(), 'sero-recordings');
  await mkdir(outputDir, { recursive: true });
  const outputPath = opts.outputPath ?? path.join(outputDir, `video-${ts}.mp4`);
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    // Encode with ffmpeg: PNG sequence → H.264 MP4.
    // Pad odd-sized captures to even dimensions because libx264 + yuv420p
    // rejects widths/heights that are not divisible by 2.
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-framerate', String(fps),
        '-i', path.join(workDir, 'frame-%05d.png'),
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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
  } catch (error) {
    console.warn('[video-encoder] MP4 encode failed, falling back to PNG frames:', error);
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Non-critical cleanup failure
    }
    const reason = error instanceof Error ? error.message : 'Unknown ffmpeg error';
    return writeFramesFallback({
      frames,
      durationMs,
      fps,
      outputPath: opts.outputPath,
      note: `ffmpeg encode failed — frames saved as PNGs instead. ${reason}`,
    });
  }

  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    // Non-critical cleanup failure
  }

  return { path: outputPath, isVideo: true, durationMs, frameCount: frames.length };
}
