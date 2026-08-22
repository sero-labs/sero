import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const metricsScript = path.resolve(__dirname, '../../../../../scripts/ci-workflow-metrics.mjs');
let fixtureRoot = '';

afterEach(async () => {
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = '';
});

describe('CI workflow metrics', () => {
  it('reports nearest-rank percentiles from completed non-cancelled runs', async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-ci-metrics-'));
    const inputPath = path.join(fixtureRoot, 'runs.json');
    const run = (seconds: number, conclusion = 'success') => ({
      conclusion,
      run_started_at: '2026-01-01T00:00:00Z',
      updated_at: new Date(Date.parse('2026-01-01T00:00:00Z') + seconds * 1000).toISOString(),
    });
    await fs.writeFile(inputPath, JSON.stringify({
      workflow_runs: [run(60), run(120), run(180), run(360), run(1, 'cancelled'), run(1, 'skipped')],
    }));

    const { stdout } = await execFileAsync(process.execPath, [
      metricsScript,
      `--input=${inputPath}`,
      '--workflow=test.yml',
      '--target-seconds=300',
    ]);

    expect(stdout).toContain('| Runs measured | 4 |');
    expect(stdout).toContain('| p50 | 2m 00s |');
    expect(stdout).toContain('| p95 | 6m 00s |');
    expect(stdout).toContain('| Target met | no |');
    expect(stdout).toContain('fewer than 30');
  });
});
