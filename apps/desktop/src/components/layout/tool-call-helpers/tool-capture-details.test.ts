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

  it('exposes the combined file as the one control to open', () => {
    const view = describeToolCapture(captureDetails());

    // One control, because the combined file holds every captured byte. A
    // per-stream button would repeat it.
    expect(view?.file).toEqual({ hostPath: '/host/combined.log', bytes: 2048 });
  });

  it('offers no file when the capture is incomplete and carries the reason', () => {
    const view = describeToolCapture({
      capture: { version: 1, captureId: 'capture-2', producerSessionId: 'session-a', complete: false, unavailableReason: 'ENOSPC' },
    });

    expect(view?.file).toBeUndefined();
    expect(view?.unavailableReason).toBe('ENOSPC');
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

  it('offers no file when the combined entry has no path', () => {
    expect(describeToolCapture(captureDetails({ combined: { stream: 'combined', bytes: 10 } }))?.file).toBeUndefined();
  });
});

describe('parseToolCaptureDetails', () => {
  it('rejects a record without a capture id', () => {
    expect(parseToolCaptureDetails({ capture: { complete: true } })).toBeNull();
    expect(parseToolCaptureDetails({ capture: 'nope' })).toBeNull();
  });

  it('reads the combined path and byte count', () => {
    const parsed = parseToolCaptureDetails(captureDetails());

    expect(parsed?.complete).toBe(true);
    expect(parsed?.combined).toEqual({ hostPath: '/host/combined.log', bytes: 2048 });
  });

  it('treats a missing byte count as zero rather than a dead path', () => {
    const parsed = parseToolCaptureDetails(captureDetails({
      combined: { stream: 'combined', hostPath: '/host/combined.log' },
    }));

    expect(parsed?.combined).toEqual({ hostPath: '/host/combined.log', bytes: 0 });
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
