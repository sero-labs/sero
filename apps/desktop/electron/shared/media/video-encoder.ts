/**
 * Streaming video encoder for Sero recordings.
 *
 * Each captured PNG goes directly to ffmpeg. The recorder never retains the
 * image sequence in memory or writes an uncompressed frame sequence to disk.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface CreateVideoRecordingOptions {
  fps: number;
  crf: number;
}

export interface VideoRecordingResult {
  path: string;
  isVideo: true;
  durationMs: number;
  frameCount: number;
}

export interface VideoRecording {
  readonly timestamps: readonly number[];
  append(base64: string, timestamp: number): Promise<void>;
  finish(outputPath?: string): Promise<VideoRecordingResult>;
  discard(): Promise<void>;
}

const RECORDINGS_DIR = path.join(tmpdir(), 'sero-recordings');

function ffmpegArgs(fps: number, crf: number, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'image2pipe',
    '-use_wallclock_as_timestamps', '1',
    '-framerate', String(fps),
    '-i', 'pipe:0',
    '-vf', 'setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-fps_mode', 'vfr',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}

function describeFfmpegFailure(code: number | null, stderr: string, processError: Error | null): Error {
  if (processError) return processError;
  const detail = stderr.trim().slice(-1_000);
  return new Error(`ffmpeg exited with code ${code}.${detail ? ` ${detail}` : ''}`);
}

/** Start a bounded-memory MP4 recording. */
export async function createVideoRecording(
  options: CreateVideoRecordingOptions,
): Promise<VideoRecording> {
  await mkdir(RECORDINGS_DIR, { recursive: true });
  const workDir = await mkdtemp(path.join(RECORDINGS_DIR, 'stream-'));
  const temporaryOutput = path.join(workDir, 'recording.mp4');
  const process = spawn('ffmpeg', ffmpegArgs(options.fps, options.crf, temporaryOutput));
  process.stdout.resume();

  const timestamps: number[] = [];
  let stderr = '';
  let processError: Error | null = null;
  let finished = false;

  process.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 4_000) stderr = stderr.slice(-4_000);
  });
  process.stdin.on('error', (error: Error) => {
    processError ??= error;
  });
  process.on('error', (error: Error) => {
    processError ??= error;
  });

  const closed = new Promise<number | null>((resolve) => {
    process.once('close', resolve);
  });

  async function discard(): Promise<void> {
    if (process.exitCode === null) {
      process.stdin.destroy();
      process.kill();
      await closed;
    }
    await rm(workDir, { recursive: true, force: true });
  }

  return {
    timestamps,

    async append(base64: string, timestamp: number): Promise<void> {
      if (finished || processError || process.exitCode !== null) {
        throw describeFfmpegFailure(process.exitCode, stderr, processError);
      }

      const accepted = process.stdin.write(Buffer.from(base64, 'base64'));
      if (!accepted) {
        const outcome = await Promise.race([
          once(process.stdin, 'drain').then(() => 'drain' as const),
          closed.then(() => 'closed' as const),
        ]);
        if (outcome === 'closed') {
          throw describeFfmpegFailure(process.exitCode, stderr, processError);
        }
      }
      timestamps.push(timestamp);
    },

    async finish(outputPath?: string): Promise<VideoRecordingResult> {
      if (finished) throw new Error('Recording has already finished.');
      finished = true;
      process.stdin.end();
      const code = await closed;
      if (code !== 0 || processError) {
        throw describeFfmpegFailure(code, stderr, processError);
      }
      if (timestamps.length === 0) throw new Error('No frames were recorded.');

      const destination = outputPath ?? path.join(RECORDINGS_DIR, `video-${Date.now()}.mp4`);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(temporaryOutput, destination);
      await rm(workDir, { recursive: true, force: true });

      return {
        path: destination,
        isVideo: true,
        durationMs: timestamps.at(-1)! - timestamps[0]!,
        frameCount: timestamps.length,
      };
    },

    discard,
  };
}
