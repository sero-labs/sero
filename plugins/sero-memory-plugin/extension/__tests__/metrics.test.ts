import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordMetric, resolveMetricsPath } from '../metrics';

const originalSeroHome = process.env.SERO_HOME;

describe('memory metrics', () => {
  let seroHome = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-metrics-'));
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('appends one valid JSON line per event to the daily metrics file', async () => {
    await Promise.all([
      recordMetric('save', { id: 'm1', scope: 'global' }),
      recordMetric('recall', { ids: ['m1'], scores: [0.8], latencyMs: 12 }),
    ]);

    const filePath = resolveMetricsPath();
    expect(path.dirname(filePath)).toBe(path.join(seroHome, 'debug', 'memory'));
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
    const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.event)).toEqual(['save', 'recall']);
    expect(events[1]).toMatchObject({ ids: ['m1'], latencyMs: 12 });
    expect(typeof events[0]!.ts).toBe('string');
  });
});
