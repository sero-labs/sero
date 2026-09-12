import { describe, expect, it } from 'vitest';

import { defaultOptimizerConfig, type OutputOptimizerConfig } from '../../shared/types';
import { SessionMetrics } from '../metrics';
import { optimizeResult } from '../optimize-result';
import type { CaptureStream } from '../capture';
import { textBlock, type TextBlock } from '../result';

function config(overrides: Partial<OutputOptimizerConfig> = {}): OutputOptimizerConfig {
  return { ...defaultOptimizerConfig(), enabled: true, ...overrides };
}

function stream(kind: 'combined' | 'stdout' | 'stderr', bytes: number, hostPath = `/host/${kind}.log`) {
  return { stream: kind, runtimePath: hostPath, hostPath, bytes };
}

function captureDetails(
  streams: { combined?: ReturnType<typeof stream>; stdout?: ReturnType<typeof stream>; stderr?: ReturnType<typeof stream> } = {},
  complete = true,
) {
  return {
    exitCode: 0,
    blocks: { payload: 0, report: 1 },
    capture: {
      version: 1,
      captureId: 'capture-1',
      producerSessionId: 'session-a',
      complete,
      ...streams,
    },
  };
}

function reportContent(payload: string, report = 'Complete output: /rt/combined.log (2.0KB)'): TextBlock[] {
  return [textBlock(payload), textBlock(report)];
}

function reader(contents: Record<string, string>): (capture: CaptureStream) => Promise<{ text: string; bytes: number }> {
  return async (capture) => {
    const text = contents[capture.stream];
    if (text === undefined) throw new Error(`no fixture for ${capture.stream}`);
    return { text, bytes: Buffer.byteLength(text, 'utf8') };
  };
}

describe('optimizeResult structured output', () => {
  it('keeps a small stdout payload exact and separate from stderr', async () => {
    const json = '{"ok":true}\n';
    const details = captureDetails({ combined: stream('combined', 40), stdout: stream('stdout', json.length), stderr: stream('stderr', 10) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('{"ok":true} tail'),
      details,
      requestedCommand: 'rg --json foo',
      config: config(),
      metrics,
      readCapture: reader({ stdout: json }),
    });

    expect((result.content[0] as TextBlock).text).toBe(json);
    expect((result.content[1] as TextBlock).text).toContain('Complete output');
    expect(result.content.some((block) => block.text.includes('stderr'))).toBe(false);
    expect(metrics.snapshot().measuredCalls).toBe(1);
  });

  it('marks an oversized structured preview incomplete and keeps the stdout file authoritative', async () => {
    const json = `{"data":"${'x'.repeat(60_000)}"}`;
    const details = captureDetails({ combined: stream('combined', json.length), stdout: stream('stdout', json.length) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('small tail'),
      details,
      requestedCommand: 'rg --json foo',
      config: config(),
      metrics,
      readCapture: reader({ stdout: json }),
    });

    const payload = (result.content[0] as TextBlock).text;
    // The payload is only the bounded preview; the notice is its own block.
    expect(payload).not.toContain('Incomplete preview');
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    expect(result.content.some((block) => block.text.includes('Incomplete preview'))).toBe(true);
    expect(metrics.snapshot().measuredCalls).toBe(1);
    expect(result.details).toMatchObject({ optimization: { measured: true, applied: false } });
  });

  it('preserves the payload and reports unmeasured when the capture is incomplete', async () => {
    const details = captureDetails({}, false);
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('received payload'),
      details,
      requestedCommand: 'rg --json foo',
      config: config(),
      metrics,
    });

    expect((result.content[0] as TextBlock).text).toBe('received payload');
    expect(metrics.snapshot().unmeasuredCalls).toBe(1);
    expect(metrics.snapshot().measuredCalls).toBe(0);
  });

  it('marks a structured preview incomplete when stdout exceeds the line limit', async () => {
    const json = Array.from({ length: 2500 }, (_, index) => `{"row":${index}}`).join('\n');
    expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(50 * 1024);
    const details = captureDetails({ combined: stream('combined', json.length), stdout: stream('stdout', json.length) });

    const result = await optimizeResult({
      content: reportContent('tail'),
      details,
      requestedCommand: 'rg --json foo',
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ stdout: json }),
    });

    expect(result.content.some((block) => block.text.includes('Incomplete preview'))).toBe(true);
    expect(Buffer.byteLength((result.content[0] as TextBlock).text, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    expect(result.details).toMatchObject({ optimization: { measured: true, applied: false } });
  });
});

describe('optimizeResult compaction', () => {
  const testOutput = ['FAIL src/a.test.ts', '  expected 1 to be 2', 'Tests: 1 failed, 0 passed'].join('\n');

  it('keeps the capture report block when compaction omitted bytes', async () => {
    const output = ['✓ passing test', ...testOutput.split('\n')].join('\n');
    const details = captureDetails({ combined: stream('combined', output.length) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm test',
      config: config(),
      metrics,
      readCapture: reader({ combined: output }),
    });

    expect((result.content[0] as TextBlock).text).toContain('FAIL src/a.test.ts');
    expect((result.content[0] as TextBlock).text).not.toContain('✓ passing test');
    // Bytes were omitted, so the report still points at something to read.
    expect(result.content.some((block) => block.text.includes('Complete output'))).toBe(true);
    const snapshot = metrics.snapshot();
    expect(snapshot.measuredCalls).toBe(1);
    expect(snapshot.inputBytes).toBe(Buffer.byteLength(output, 'utf8'));
  });

  it('drops the capture report when the payload already shows everything', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm test',
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    // Every line was protected, so nothing was omitted. Paying for a report
    // here costs more context than the output it describes.
    expect(result.content.some((block) => block.text.includes('Complete output'))).toBe(false);
    const blocks = (result.details as { blocks?: Record<string, unknown> }).blocks;
    expect(blocks?.payload).toBe(0);
    expect(blocks?.report).toBeUndefined();
  });

  it('omits the already-compact notice', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm test',
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    expect(result.content.some((block) => block.text.includes('already compact'))).toBe(false);
  });

  it('shows the RTK form without the session state environment', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm install',
      rewrite: {
        requested: 'pnpm install',
        executed: "RTK_DB_PATH='/state/history.db' '/toolchains/rtk' pnpm install",
        display: 'rtk pnpm install',
      },
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    const notice = result.content.find((block) => block.text.includes('Command executed differently'));
    expect(notice?.text).toContain('- requested: pnpm install');
    expect(notice?.text).toContain('- executed:  rtk pnpm install');
    expect(notice?.text).not.toContain('RTK_DB_PATH');
  });

  it('fails open when the capture cannot be read after a rewrite', async () => {
    const details = captureDetails({ combined: stream('combined', 100) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('received payload'),
      details,
      requestedCommand: 'git status',
      rewrite: { requested: 'git status', executed: "rtk git status" },
      config: config(),
      metrics,
      readCapture: async () => { throw new Error('disk error'); },
    });

    expect((result.content[0] as TextBlock).text).toBe('received payload');
    expect(result.content.some((block) => block.text.includes('Command executed differently'))).toBe(true);
    expect(result.details).toMatchObject({ optimization: { measured: false } });
  });

  it('keeps unstructured output unchanged and counts it as measured', async () => {
    const text = 'just some plain text\n';
    const details = captureDetails({ combined: stream('combined', text.length) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('plain tail'),
      details,
      requestedCommand: 'echo hello',
      config: config(),
      metrics,
      readCapture: reader({ combined: text }),
    });

    expect((result.content[0] as TextBlock).text).toBe('plain tail');
    expect(result.details).toMatchObject({ optimization: { measured: true, applied: false } });
  });

  it('records only the accounting a resumed session re-reads', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm install',
      rewrite: {
        requested: 'pnpm install',
        executed: "RTK_DB_PATH='/state/history.db' '/toolchains/rtk' pnpm install",
        display: 'rtk pnpm install',
      },
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    // The bound command and the category/rule had no reader and were written
    // into every session entry. Only the history-seeding fields remain.
    const optimization = (result.details as { optimization: Record<string, unknown> }).optimization;
    expect(Object.keys(optimization).sort()).toEqual(
      ['applied', 'compactedBytes', 'inputBytes', 'measured'],
    );
    expect(JSON.stringify(result.details)).not.toContain('RTK_DB_PATH');
  });

  it('drops a capture stream that repeats the combined file', async () => {
    // stdout holds every captured byte here, so recording it as well would put
    // the same 111 bytes into the session entry twice.
    const details = captureDetails({
      combined: stream('combined', testOutput.length),
      stdout: stream('stdout', testOutput.length),
    });

    const result = await optimizeResult({
      content: reportContent('truncated tail'),
      details,
      requestedCommand: 'pnpm test',
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    const capture = (result.details as { capture: Record<string, unknown> }).capture;
    expect(capture.combined).toBeDefined();
    expect(capture.stdout).toBeUndefined();
  });

  it('records confirmed zero output from the bash metadata', async () => {
    const metrics = new SessionMetrics();
    const result = await optimizeResult({
      content: [textBlock('(no output)')],
      details: { exitCode: 0, blocks: { payload: 0 } },
      requestedCommand: 'true',
      config: config(),
      metrics,
    });

    expect(metrics.snapshot().measuredCalls).toBe(1);
    expect(metrics.snapshot().unmeasuredCalls).toBe(0);
    expect(metrics.snapshot().inputBytes).toBe(0);
    expect(result.content).toHaveLength(1);
  });

  it('omits the optimisation notice when notices are off but still marks omissions', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });
    const metrics = new SessionMetrics();

    const result = await optimizeResult({
      content: reportContent('tail'),
      details,
      requestedCommand: 'pnpm test',
      config: config({ notices: false }),
      metrics,
      readCapture: reader({ combined: testOutput }),
    });

    expect(result.content.some((block) => block.text.includes('Output optimizer:'))).toBe(false);
  });

  it('bypasses compaction and accounting for a # no-opt command', async () => {
    const details = captureDetails({ combined: stream('combined', testOutput.length) });
    const metrics = new SessionMetrics();
    const readCapture = reader({ combined: testOutput });

    const result = await optimizeResult({
      content: reportContent('raw tail'),
      details,
      requestedCommand: 'pnpm test # no-opt',
      config: config(),
      metrics,
      readCapture,
    });

    expect((result.content[0] as TextBlock).text).toBe('raw tail');
    expect(result.details).not.toHaveProperty('optimization');
    expect(metrics.snapshot().measuredCalls).toBe(0);
    expect(metrics.snapshot().unmeasuredCalls).toBe(0);
  });

  it('keeps the exit code visible when it replaces the payload', async () => {
    const details = { ...captureDetails({ combined: stream('combined', testOutput.length) }), exitCode: 7 };

    const result = await optimizeResult({
      content: reportContent('raw tail\n\nCommand exited with code 7'),
      details,
      requestedCommand: 'pnpm test',
      config: config(),
      metrics: new SessionMetrics(),
      readCapture: reader({ combined: testOutput }),
    });

    expect(result.content.some((block) => block.text.includes('Command exited with code 7'))).toBe(true);
  });

  it('counts a confirmed empty structured command as measured zero', async () => {
    const metrics = new SessionMetrics();
    const result = await optimizeResult({
      content: [textBlock('(no output)')],
      details: { exitCode: 0, blocks: { payload: 0 } },
      requestedCommand: 'rg --json foo',
      config: config(),
      metrics,
    });

    expect(metrics.snapshot().measuredCalls).toBe(1);
    expect(metrics.snapshot().unmeasuredCalls).toBe(0);
    expect(metrics.snapshot().inputBytes).toBe(0);
    expect(result.content).toHaveLength(1);
  });
});
