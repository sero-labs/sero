import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncAutoConsolidationCronJobSync } from '../automation-state';

async function createTempSeroHome(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'sero-memory-automation-'));
}

describe('memory auto-consolidation cron sync', () => {
  const originalEnv = {
    SERO_HOME: process.env.SERO_HOME,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  };

  let seroHome = '';

  beforeEach(async () => {
    seroHome = await createTempSeroHome();
    process.env.SERO_HOME = seroHome;
    delete process.env.PI_CODING_AGENT_DIR;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('refuses to rewrite malformed cron state files', async () => {
    const cronStatePath = path.join(seroHome, 'apps', 'cron', 'state.json');
    await mkdir(path.dirname(cronStatePath), { recursive: true });
    const malformedState = '{"jobs": [';
    await writeFile(cronStatePath, malformedState, 'utf8');

    expect(() => syncAutoConsolidationCronJobSync('daily')).toThrowError(
      /Memory auto-consolidation will not rewrite it until the file is repaired/,
    );

    await expect(readFile(cronStatePath, 'utf8')).resolves.toBe(malformedState);
  });

  it('bootstraps a missing cron state file with the scheduled consolidation job', async () => {
    const result = syncAutoConsolidationCronJobSync('weekly');
    const cronStatePath = path.join(seroHome, 'apps', 'cron', 'state.json');
    const state = JSON.parse(await readFile(cronStatePath, 'utf8')) as {
      autostart: boolean;
      jobs: Array<{ name: string; schedule: string; runIfMissed: boolean }>;
    };

    expect(result.changed).toBe(true);
    expect(result.cronChanged).toBe(true);
    expect(result.schedule).toBe('0 3 * * 0');
    expect(result.autostart).toBe(true);
    expect(state.autostart).toBe(true);
    expect(state.jobs).toEqual([
      expect.objectContaining({
        name: 'memory-consolidation',
        schedule: '0 3 * * 0',
        runIfMissed: true,
      }),
    ]);
  });
});
