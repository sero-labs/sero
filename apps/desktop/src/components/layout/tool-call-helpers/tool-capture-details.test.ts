import { describe, expect, it } from 'vitest';

import { describeToolCapture, formatBytes, parseToolCaptureDetails } from './tool-capture-details';

function captureDetails(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exitCode: 0,
    capture: {
      version: 1,
      captureId: 'capture-1',
      producerSessionId: 'session-a',
      complete: true,
      combined: { stream: 'combined', runtimePath: '/rt/combined.log', hostPath: '/host/combined.log', bytes: 2048 },
      stdout: { stream: 'stdout', runtimePath: '/rt/stdout.log', hostPath: '/host/stdout.log', bytes: 1024 },
      stderr: { stream: 'stderr', runtimePath: '/rt/stderr.log', hostPath: '/host/stderr.log', bytes: 12 },
      ...overrides,
    },
  };
}

describe('describeToolCapture', () => {
  it('returns nothing for a tool result without a capture', () => {
    expect(describeToolCapture(undefined)).toBeNull();
    expect(describeToolCapture({ exitCode: 0 })).toBeNull();
    expect(describeToolCapture({ capture: { complete: true } })).toBeNull();
  });

  it('lists every capture file for the user to open', () => {
    const view = describeToolCapture(captureDetails());

    expect(view?.capture.complete).toBe(true);
    expect(view?.files.map((file) => file.kind)).toEqual(['combined', 'stdout', 'stderr']);
    expect(view?.files[0]).toMatchObject({ label: 'Full details', hostPath: '/host/combined.log', bytes: 2048 });
  });

  it('omits a stream file that produced no output', () => {
    const view = describeToolCapture(captureDetails({ stderr: undefined }));

    expect(view?.files.map((file) => file.kind)).toEqual(['combined', 'stdout']);
  });

  it('exposes the executed command for the viewer', () => {
    const view = describeToolCapture({
      ...captureDetails(),
      rewrite: { requested: 'pnpm install', executed: 'rtk pnpm install' },
    });

    expect(view?.rewrite).toEqual({ requested: 'pnpm install', executed: 'rtk pnpm install' });
  });

  it('ignores a malformed rewrite entry', () => {
    expect(describeToolCapture({ ...captureDetails(), rewrite: { requested: 'pnpm install' } })?.rewrite).toBeUndefined();
    expect(describeToolCapture({ ...captureDetails(), rewrite: 'nope' })?.rewrite).toBeUndefined();
  });

  it('omits a stream that holds the combined file all over again', () => {
    // With nothing on stderr, stdout carries every captured byte, so a second
    // button onto the same content is noise.
    const view = describeToolCapture(captureDetails({
      stderr: undefined,
      stdout: { stream: 'stdout', runtimePath: '/rt/stdout.log', hostPath: '/host/stdout.log', bytes: 2048 },
    }));

    expect(view?.files.map((file) => file.kind)).toEqual(['combined']);
  });

  it('still lists a stream that differs from combined', () => {
    // stdout plus stderr interleave into combined, so both are worth offering.
    const view = describeToolCapture(captureDetails({
      stdout: { stream: 'stdout', runtimePath: '/rt/stdout.log', hostPath: '/host/stdout.log', bytes: 2036 },
      stderr: { stream: 'stderr', runtimePath: '/rt/stderr.log', hostPath: '/host/stderr.log', bytes: 12 },
    }));

    expect(view?.files.map((file) => file.kind)).toEqual(['combined', 'stdout', 'stderr']);
  });

  it('says the model received a bounded preview only when truncation metadata is present', () => {
    expect(describeToolCapture(captureDetails())?.preview).toBe(false);

    const truncated = captureDetails();
    truncated.truncation = { truncated: true, truncatedBy: 'lines' };
    expect(describeToolCapture(truncated)?.preview).toBe(true);
  });

  it('offers no files when the capture is incomplete and carries the reason', () => {
    const view = describeToolCapture({
      capture: { version: 1, captureId: 'capture-2', producerSessionId: 'session-a', complete: false, unavailableReason: 'ENOSPC' },
    });

    expect(view?.capture.complete).toBe(false);
    expect(view?.capture.unavailableReason).toBe('ENOSPC');
    expect(view?.files).toEqual([]);
  });

  it('drops a malformed stream entry instead of rendering a dead path', () => {
    const view = describeToolCapture(captureDetails({ stdout: { stream: 'stdout', bytes: 10 } }));

    expect(view?.files.map((file) => file.kind)).toEqual(['combined', 'stderr']);
  });
});

describe('parseToolCaptureDetails', () => {
  it('rejects a record without a capture id', () => {
    expect(parseToolCaptureDetails({ capture: { complete: true } })).toBeNull();
    expect(parseToolCaptureDetails({ capture: 'nope' })).toBeNull();
  });

  it('falls back to the host path when no runtime path was reported', () => {
    const parsed = parseToolCaptureDetails(captureDetails({
      combined: { stream: 'combined', hostPath: '/host/combined.log', bytes: 4 },
    }));

    expect(parsed?.combined).toEqual({
      stream: 'combined',
      hostPath: '/host/combined.log',
      runtimePath: '/host/combined.log',
      bytes: 4,
    });
  });
});

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB');
    expect(formatBytes(Number.NaN)).toBe('0B');
  });
});
