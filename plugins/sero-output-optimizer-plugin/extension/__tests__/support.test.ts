import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultOptimizerConfig, reductionPercent, type SessionSavings } from '../../shared/types';
import { normalizeConfig } from '../config';
import { buildPreview, PREVIEW_MAX_BYTES, PREVIEW_MAX_LINES } from '../preview';
import { isConfirmedZeroOutput, parseCaptureRecord } from '../capture';
import { RtkResolver } from '../rtk-client';
import { SessionMetrics } from '../metrics';
import { seedMetricsFromHistory } from '../history';
import { SessionState } from '../state';

describe('config', () => {
  it('is disabled for a fresh profile', () => {
    expect(normalizeConfig(undefined).enabled).toBe(false);
    expect(defaultOptimizerConfig().enabled).toBe(false);
  });

  it('keeps explicitly disabled classes and defaults the rest on', () => {
    const config = normalizeConfig({ enabled: true, rewriteClasses: { git: false } });
    expect(config.enabled).toBe(true);
    expect(config.rewriteClasses.git).toBe(false);
    expect(config.rewriteClasses.fileReads).toBe(true);
    expect(config.notices).toBe(true);
  });
});

describe('preview', () => {
  it('returns a small candidate unchanged', () => {
    const preview = buildPreview('line one\nline two');
    expect(preview.truncated).toBe(false);
    expect(preview.content).toBe('line one\nline two');
    expect(preview.omittedLines).toBe(0);
  });

  it('bounds a candidate that exceeds the line limit', () => {
    const text = Array.from({ length: PREVIEW_MAX_LINES + 50 }, (_, index) => `line ${index}`).join('\n');
    const preview = buildPreview(text);
    expect(preview.truncated).toBe(true);
    expect(preview.shownLines).toBe(PREVIEW_MAX_LINES);
    expect(preview.omittedLines).toBe(50);
    expect(preview.content.split('\n')).toHaveLength(PREVIEW_MAX_LINES);
  });

  it('bounds a candidate that exceeds the byte limit', () => {
    const text = 'x'.repeat(PREVIEW_MAX_BYTES + 100);
    const preview = buildPreview(text);
    expect(preview.truncated).toBe(true);
    expect(Buffer.byteLength(preview.content, 'utf8')).toBeLessThanOrEqual(PREVIEW_MAX_BYTES);
  });
});

describe('capture', () => {
  const record = {
    captureId: 'cap-1',
    complete: true,
    combined: { stream: 'combined', runtimePath: '/r/combined.log', hostPath: '/h/combined.log', bytes: 12 },
    stdout: { stream: 'stdout', runtimePath: '/r/stdout.log', hostPath: '/h/stdout.log', bytes: 4 },
  };

  it('parses a capture record from details', () => {
    const parsed = parseCaptureRecord({ capture: record });
    expect(parsed?.complete).toBe(true);
    expect(parsed?.combined?.bytes).toBe(12);
    expect(parsed?.stdout?.hostPath).toBe('/h/stdout.log');
  });

  it('requires the bash exit metadata to confirm zero output', () => {
    expect(isConfirmedZeroOutput({ exitCode: 0 })).toBe(true);
    expect(isConfirmedZeroOutput({})).toBe(false);
    expect(isConfirmedZeroOutput({ exitCode: 0, capture: { complete: false } })).toBe(false);
    expect(isConfirmedZeroOutput({ exitCode: 0, truncation: {} })).toBe(false);
  });
});

describe('metrics', () => {
  it('computes the session reduction across changed and unchanged calls', () => {
    const savings: SessionSavings = {
      measuredCalls: 2,
      unmeasuredCalls: 0,
      inputBytes: 2000,
      compactedBytes: 1500,
      optimizedCalls: 1,
      skippedCalls: 0,
    };
    expect(reductionPercent(savings)).toBe(25);
  });

  it('shows no percentage when nothing was measured', () => {
    expect(reductionPercent({
      measuredCalls: 0,
      unmeasuredCalls: 0,
      inputBytes: 0,
      compactedBytes: 0,
      optimizedCalls: 0,
      skippedCalls: 0,
    })).toBeNull();
  });

  it('counts a confirmed zero-output call as measured', () => {
    const metrics = new SessionMetrics();
    metrics.recordMeasured(0, 0, false);
    const snapshot = metrics.snapshot();
    expect(snapshot.measuredCalls).toBe(1);
    expect(snapshot.unmeasuredCalls).toBe(0);
  });
});

describe('session state', () => {
  it('counts each tool call once', () => {
    const state = new SessionState();
    expect(state.claimAccounting('call-1')).toBe(true);
    expect(state.claimAccounting('call-1')).toBe(false);
    expect(state.claimAccounting('call-2')).toBe(true);
  });

  it('takes a rewrite record once', () => {
    const state = new SessionState();
    state.recordRewrite('call-1', { requested: 'git status', executed: 'rtk git status' });
    expect(state.takeRewrite('call-1')?.executed).toBe('rtk git status');
    expect(state.takeRewrite('call-1')).toBeUndefined();
  });
});

describe('history seeding', () => {
  function entry(toolCallId: string, optimization: Record<string, unknown>) {
    return {
      type: 'message',
      message: { role: 'toolResult', toolName: 'bash', toolCallId, details: { optimization } },
    };
  }

  const entries = [
    entry('call-1', { measured: true, unmeasured: false, inputBytes: 1000, compactedBytes: 500, applied: true }),
    entry('call-2', { measured: true, unmeasured: false, inputBytes: 1000, compactedBytes: 1000, applied: false }),
    entry('call-3', { measured: false, unmeasured: true, inputBytes: 0, compactedBytes: 0, applied: false }),
  ];

  it('counts each history entry once across replay', () => {
    const metrics = new SessionMetrics();
    const state = new SessionState();
    seedMetricsFromHistory(metrics, state, entries);
    seedMetricsFromHistory(metrics, state, entries);

    const snapshot = metrics.snapshot();
    expect(snapshot.measuredCalls).toBe(2);
    expect(snapshot.unmeasuredCalls).toBe(1);
    expect(snapshot.inputBytes).toBe(2000);
    expect(snapshot.compactedBytes).toBe(1500);
    expect(reductionPercent(snapshot)).toBe(25);
  });

  it('lets a fork inherit the entries copied into its history', () => {
    const metrics = new SessionMetrics();
    const forkState = new SessionState();
    seedMetricsFromHistory(metrics, forkState, entries);

    expect(metrics.snapshot().measuredCalls).toBe(2);
    expect(forkState.claimAccounting('call-1')).toBe(false);
  });
});

describe('rtk resolver', () => {
  function fakeBus(resolutions: Array<{ state: string; reason?: string; version?: string }>) {
    let index = 0;
    return {
      emit: (_channel: string, data: unknown) => {
        const request = data as { accept(): void; resolve(result: unknown): void };
        request.accept();
        request.resolve(resolutions[Math.min(index, resolutions.length - 1)]);
        index += 1;
      },
      on: () => () => undefined,
      calls: () => index,
    };
  }

  it('caches an available answer and retries an unavailable one', async () => {
    const bus = fakeBus([{ state: 'installing' }, { state: 'available', version: '0.49.0' }]);
    const resolver = new RtkResolver(bus, 'session-a', 'workspace-a');

    const first = await resolver.resolve();
    expect(first.state).toBe('installing');

    const second = await resolver.resolve();
    expect(second.state).toBe('available');
    expect(bus.calls()).toBe(2);

    const third = await resolver.resolve();
    expect(third.state).toBe('available');
    expect(bus.calls()).toBe(2);
  });
});

describe('config file', () => {
  const originalHome = process.env.SERO_HOME;
  let directory: string | null = null;

  afterEach(async () => {
    if (directory) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      directory = null;
    }
    if (originalHome === undefined) delete process.env.SERO_HOME;
    else process.env.SERO_HOME = originalHome;
  });

  it('round-trips through the profile state directory', async () => {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'output-optimizer-'));
    process.env.SERO_HOME = directory;
    const { loadConfig, saveConfig } = await import('../config');

    expect((await loadConfig()).enabled).toBe(false);
    await saveConfig({ ...defaultOptimizerConfig(), enabled: true });
    expect((await loadConfig()).enabled).toBe(true);
  });
});
