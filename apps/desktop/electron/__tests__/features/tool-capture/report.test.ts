import { describe, expect, it } from 'vitest';

import { renderCaptureReport } from '@electron/features/tool-capture/report';
import type { ToolCaptureRecord, ToolCaptureStream } from '@electron/features/tool-capture/types';

/**
 * The capture report is model-visible content, so every line it adds costs
 * context. These cases pin what it must not repeat.
 */

function stream(kind: ToolCaptureStream['stream'], bytes: number): ToolCaptureStream {
  return { stream: kind, runtimePath: `/rt/${kind}.log`, hostPath: `/host/${kind}.log`, bytes };
}

function record(overrides: Partial<ToolCaptureRecord> = {}): ToolCaptureRecord {
  return {
    version: 1,
    captureId: 'capture-1',
    producerSessionId: 'session-a',
    complete: true,
    combined: stream('combined', 2048),
    ...overrides,
  };
}

describe('renderCaptureReport', () => {
  it('reports nothing without a capture record', () => {
    expect(renderCaptureReport(undefined)).toBeUndefined();
  });

  it('reports the complete output path and size', () => {
    const report = renderCaptureReport(record({ stdout: stream('stdout', 2036), stderr: stream('stderr', 12) }));

    expect(report).toContain('Complete output: /rt/combined.log (2.0KB)');
    expect(report).toContain('Streams:');
    expect(report).toContain('- stdout: /rt/stdout.log (2.0KB)');
    expect(report).toContain('- stderr: /rt/stderr.log (12B)');
  });

  it('omits a stream that holds the combined file all over again', () => {
    // Nothing was written to stderr, so stdout is the combined file byte for
    // byte. Listing both would double the cost of a single fact.
    const report = renderCaptureReport(record({ stdout: stream('stdout', 2048) }));

    expect(report).toContain('Complete output: /rt/combined.log (2.0KB)');
    expect(report).not.toContain('Streams:');
    expect(report).not.toContain('stdout.log');
  });

  it('keeps a stream that carries part of the output', () => {
    const report = renderCaptureReport(record({ stdout: stream('stdout', 2036), stderr: stream('stderr', 12) }));

    expect(report).toContain('stdout.log');
    expect(report).toContain('stderr.log');
  });

  it('says when the command wrote no separate stream output', () => {
    expect(renderCaptureReport(record())).toContain('The command wrote no separate stream output.');
  });

  it('reports an incomplete capture instead of a path', () => {
    const report = renderCaptureReport(record({ complete: false, combined: undefined, unavailableReason: 'ENOSPC' }));

    expect(report).toBe('Complete output unavailable: ENOSPC');
  });
});
