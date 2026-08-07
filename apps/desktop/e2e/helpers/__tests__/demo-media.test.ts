import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleDemo } from '../demo';
import {
  CAMPAIGN_CLIPS,
  formatElapsed,
  probeVideo,
  validateDemoVideo,
  validateSpeedSegments,
  withBoundedRetries,
} from '../demo-media';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-demo-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('campaign demo media validation', () => {
  it('formats truthful elapsed labels', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_900)).toBe('01:05');
    expect(formatElapsed(3_665_000)).toBe('01:01:05');
  });

  it('rejects accelerated ranges without a timelapse label and exact real duration', () => {
    expect(validateSpeedSegments([
      { start: 5, end: 15, speed: 8, label: 'Building', realElapsedMs: 9_000 },
    ], 20)).toEqual([
      'Accelerated segment 5-15 needs a timelapse label.',
      'Accelerated segment 5-15 needs its real 10000ms duration.',
    ]);
  });

  it('rejects overlap, invalid speed, and out-of-range segments', () => {
    const errors = validateSpeedSegments([
      { start: 2, end: 8, speed: 1 },
      { start: 7, end: 12, speed: 20 },
    ], 10);
    expect(errors).toContain('Segment 7-12 is outside the 10s source.');
    expect(errors).toContain('Segment 7-12 speed must be between 1x and 16x.');
    expect(errors).toContain('Segment 7-12 overlaps an earlier segment.');
  });

  it('retries only within the configured bound', async () => {
    const attempts: number[] = [];
    const result = await withBoundedRetries(async (attempt) => {
      attempts.push(attempt);
      return attempt;
    }, { attempts: 3, accept: (attempt) => attempt === 2 });
    expect(result).toBe(2);
    expect(attempts).toEqual([1, 2]);
    await expect(withBoundedRetries(async () => false, { attempts: 4 })).rejects.toThrow(
      'Retry attempts must be an integer between 1 and 3.',
    );
  });

  it('encodes a labelled timelapse and validates H.264 yuv420p output', async () => {
    const dir = tempDir();
    const raw = path.join(dir, 'raw.mp4');
    const output = path.join(dir, CAMPAIGN_CLIPS['plugin-build'].fileName);
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15:duration=3',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', raw,
    ]);
    await assembleDemo(raw, output, [
      { start: 1, end: 2, speed: 2, label: 'TIMELAPSE', realElapsedMs: 1_000 },
    ]);

    const probe = await probeVideo(output);
    expect(probe).toMatchObject({ codec: 'h264', pixelFormat: 'yuv420p', height: 1080 });
    const validation = await validateDemoVideo(
      output,
      { ...CAMPAIGN_CLIPS['plugin-build'], minimumSeconds: 2, maximumSeconds: 4 },
      { outputDir: dir, visibleClickCount: 1 },
    );
    expect(validation).toMatchObject({ ok: true, errors: [] });
  }, 30_000);

  it('fails missing files and recordings without verified visible clicks', async () => {
    const dir = tempDir();
    const validation = await validateDemoVideo(
      path.join(dir, CAMPAIGN_CLIPS['hn-held-back'].fileName),
      CAMPAIGN_CLIPS['hn-held-back'],
      { outputDir: dir, visibleClickCount: 0 },
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('The final MP4 is missing or empty.');
  });
});
