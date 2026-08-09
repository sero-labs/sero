import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CampaignClipId = 'plugin-build' | 'first-use' | 'hn-held-back';

export interface CampaignClipProfile {
  id: CampaignClipId;
  fileName: string;
  minimumSeconds: number;
  maximumSeconds: number;
  caption: string;
  requiresElapsedTimer: boolean;
}

export interface DemoSpeedSegment {
  start: number;
  end: number;
  speed: number;
  realElapsedMs?: number;
  label?: string;
}

export interface VideoProbe {
  codec: string;
  pixelFormat: string;
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
}

export interface VideoFrameQuality {
  blackSegments: Array<{ start: number; end: number }>;
  frozenSegments: Array<{ start: number; end: number }>;
}

export interface DemoValidation {
  ok: boolean;
  errors: string[];
  probe: VideoProbe | null;
  frameQuality: VideoFrameQuality | null;
}

export const CAMPAIGN_CLIPS: Record<CampaignClipId, CampaignClipProfile> = {
  'plugin-build': {
    id: 'plugin-build',
    fileName: 'plugin-build.mp4',
    minimumSeconds: 60,
    maximumSeconds: 90,
    caption: 'Build and use a release checklist plugin from one prompt.',
    requiresElapsedTimer: false,
  },
  'first-use': {
    id: 'first-use',
    fileName: 'first-use-macos.mp4',
    minimumSeconds: 45,
    maximumSeconds: 120,
    caption: 'Fresh Mac to first useful Sero answer in [REAL ELAPSED TIME].',
    requiresElapsedTimer: true,
  },
  'hn-held-back': {
    id: 'hn-held-back',
    fileName: 'hn-held-back.mp4',
    minimumSeconds: 45,
    maximumSeconds: 90,
    caption: '',
    requiresElapsedTimer: false,
  },
};

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [minutes, seconds].map((value) => String(value).padStart(2, '0'));
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${parts.join(':')}` : parts.join(':');
}

export function validateSpeedSegments(segments: DemoSpeedSegment[], durationSeconds: number): string[] {
  const errors: string[] = [];
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  let previousEnd = 0;

  for (const segment of ordered) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0) {
      errors.push('Segment times must be finite and start at or after zero.');
      continue;
    }
    if (segment.end <= segment.start || segment.end > durationSeconds) {
      errors.push(`Segment ${segment.start}-${segment.end} is outside the ${durationSeconds}s source.`);
    }
    if (!Number.isFinite(segment.speed) || segment.speed < 1 || segment.speed > 16) {
      errors.push(`Segment ${segment.start}-${segment.end} speed must be between 1x and 16x.`);
    }
    if (segment.start < previousEnd) errors.push(`Segment ${segment.start}-${segment.end} overlaps an earlier segment.`);
    if (segment.speed > 1) {
      if (!segment.label?.toLowerCase().includes('timelapse')) {
        errors.push(`Accelerated segment ${segment.start}-${segment.end} needs a timelapse label.`);
      }
      const sourceElapsedMs = Math.round((segment.end - segment.start) * 1000);
      if (segment.realElapsedMs !== sourceElapsedMs) {
        errors.push(`Accelerated segment ${segment.start}-${segment.end} needs its real ${sourceElapsedMs}ms duration.`);
      }
    }
    previousEnd = Math.max(previousEnd, segment.end);
  }
  return errors;
}

export async function withBoundedRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: { attempts: number; delayMs?: number; accept?: (value: T) => boolean },
): Promise<T> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1 || options.attempts > 3) {
    throw new Error('Retry attempts must be an integer between 1 and 3.');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      if (!options.accept || options.accept(value)) return value;
      lastError = new Error(`Attempt ${attempt} did not pass validation.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < options.attempts && options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseFrameRate(value: string | undefined): number {
  if (!value) return 0;
  const [numeratorRaw = '0', denominatorRaw = '1'] = value.split('/');
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function probeVideo(file: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration',
    '-of', 'json', file,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      codec_name?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error(`No video stream found in ${file}.`);
  return {
    codec: stream.codec_name ?? '',
    pixelFormat: stream.pix_fmt ?? '',
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    durationSeconds: Number(parsed.format?.duration ?? 0),
    frameRate: parseFrameRate(stream.avg_frame_rate),
  };
}

function pairedSegments(text: string, startName: string, endName: string): Array<{ start: number; end: number }> {
  const starts = [...text.matchAll(new RegExp(`${startName}: ([0-9.]+)`, 'g'))].map((match) => Number(match[1]));
  const ends = [...text.matchAll(new RegExp(`${endName}: ([0-9.]+)`, 'g'))].map((match) => Number(match[1]));
  return starts.flatMap((start, index) => Number.isFinite(ends[index]) ? [{ start, end: ends[index]! }] : []);
}

export async function inspectVideoFrames(file: string): Promise<VideoFrameQuality> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-v', 'info', '-i', file,
    '-vf', 'blackdetect=d=2:pic_th=0.98,freezedetect=n=-60dB:d=15',
    '-an', '-f', 'null', '-',
  ]);
  return {
    blackSegments: pairedSegments(stderr, 'black_start', 'black_end'),
    frozenSegments: pairedSegments(stderr, 'freeze_start', 'freeze_end'),
  };
}

export async function createReviewContactSheet(file: string, output: string): Promise<void> {
  const duration = (await probeVideo(file)).durationSeconds;
  const interval = Math.max(0.1, duration / 12);
  await execFileAsync('ffmpeg', [
    '-y', '-i', file,
    '-vf', `fps=1/${interval},scale=480:-1:flags=lanczos,tile=4x3`,
    '-frames:v', '1', '-q:v', '2', output,
  ]);
}

export async function validateDemoVideo(
  file: string,
  profile: CampaignClipProfile,
  options: { outputDir: string; visibleClickCount: number; forbiddenText?: string[] } = {
    outputDir: path.dirname(file),
    visibleClickCount: 0,
  },
): Promise<DemoValidation> {
  const errors: string[] = [];
  const resolved = path.resolve(file);
  const outputDir = `${path.resolve(options.outputDir)}${path.sep}`;
  if (!resolved.startsWith(outputDir)) errors.push('The final MP4 must stay inside the configured demo output directory.');
  if (path.basename(resolved) !== profile.fileName) errors.push(`Expected final file name ${profile.fileName}.`);
  if (!fs.existsSync(resolved) || fs.statSync(resolved).size === 0) {
    return {
      ok: false,
      errors: [...errors, 'The final MP4 is missing or empty.'],
      probe: null,
      frameQuality: null,
    };
  }

  let probe: VideoProbe | null = null;
  try {
    probe = await probeVideo(resolved);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (probe) {
    if (probe.codec !== 'h264') errors.push(`Expected H.264, found ${probe.codec || 'unknown codec'}.`);
    if (probe.pixelFormat !== 'yuv420p') errors.push(`Expected yuv420p, found ${probe.pixelFormat || 'unknown pixel format'}.`);
    if (probe.height !== 1080) errors.push(`Expected 1080p output, found ${probe.width}x${probe.height}.`);
    if (probe.frameRate < 14 || probe.frameRate > 31) errors.push(`Frame rate ${probe.frameRate.toFixed(2)} is outside 14-31 fps.`);
    if (probe.durationSeconds < profile.minimumSeconds || probe.durationSeconds > profile.maximumSeconds) {
      errors.push(`Duration ${probe.durationSeconds.toFixed(2)}s is outside ${profile.minimumSeconds}-${profile.maximumSeconds}s.`);
    }
  }
  if (options.visibleClickCount < 1) errors.push('No visible click pulse was verified during recording.');

  let frameQuality: VideoFrameQuality | null = null;
  try {
    frameQuality = await inspectVideoFrames(resolved);
    if (frameQuality.blackSegments.length > 0) errors.push('The video contains a black segment lasting at least two seconds.');
    if (frameQuality.frozenSegments.length > 0) errors.push('The video contains a frozen segment lasting at least 15 seconds.');
  } catch (error) {
    errors.push(`Frame quality scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const forbidden = options.forbiddenText ?? [];
  for (const value of forbidden) {
    if (value.trim()) errors.push(`Manual frame review must confirm removal of sensitive value: ${value}.`);
  }
  return { ok: errors.length === 0, errors, probe, frameQuality };
}
