import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  describeAutoConsolidationCadence,
  getAutoConsolidationCommand,
  getAutoConsolidationJobName,
  syncAutoConsolidationCronJobSync,
} from '@plugins/sero-memory-plugin/extension/automation-state';

describe('memory auto-consolidation schedule sync', () => {
  const previousSeroHome = process.env.SERO_HOME;
  let seroHome = '';

  beforeEach(() => {
    seroHome = mkdtempSync(path.join(os.tmpdir(), 'sero-memory-auto-'));
    process.env.SERO_HOME = seroHome;
  });

  afterEach(() => {
    if (previousSeroHome === undefined) {
      delete process.env.SERO_HOME;
    } else {
      process.env.SERO_HOME = previousSeroHome;
    }
    if (seroHome) {
      rmSync(seroHome, { recursive: true, force: true });
    }
  });

  it('seeds a weekly cron job and enables autostart by default', () => {
    const result = syncAutoConsolidationCronJobSync();
    const cronState = JSON.parse(
      readFileSync(path.join(seroHome, 'apps', 'cron', 'state.json'), 'utf8'),
    ) as {
      autostart: boolean;
      jobs: Array<{ name: string; schedule: string; prompt: string; channel: string; runIfMissed?: boolean }>;
    };

    expect(result.cadence).toBe('weekly');
    expect(result.schedule).toBe('0 3 * * 0');
    expect(describeAutoConsolidationCadence(result.cadence)).toContain('weekly');
    expect(cronState.autostart).toBe(true);
    expect(cronState.jobs).toHaveLength(1);
    expect(cronState.jobs[0]).toMatchObject({
      name: getAutoConsolidationJobName(),
      schedule: '0 3 * * 0',
      channel: 'memory',
      runIfMissed: true,
    });
    expect(cronState.jobs[0]?.prompt).toContain(getAutoConsolidationCommand());
  });

  it('removes only the memory job when auto-consolidation is turned off', () => {
    const cronStatePath = path.join(seroHome, 'apps', 'cron', 'state.json');
    mkdirSync(path.dirname(cronStatePath), { recursive: true });
    writeFileSync(cronStatePath, JSON.stringify({
      jobs: [
        {
          name: getAutoConsolidationJobName(),
          schedule: '0 3 * * 0',
          prompt: 'old memory prompt',
          channel: 'memory',
          disabled: false,
          runIfMissed: true,
        },
        {
          name: 'other-job',
          schedule: '0 9 * * 1',
          prompt: 'do something else',
          channel: 'cron',
          disabled: false,
        },
      ],
      reminders: [],
      schedulerActive: false,
      autostart: true,
      lastRunResults: [],
    }, null, 2), 'utf8');

    const result = syncAutoConsolidationCronJobSync('off');
    const cronState = JSON.parse(readFileSync(cronStatePath, 'utf8')) as {
      autostart: boolean;
      jobs: Array<{ name: string }>;
    };

    expect(result.cadence).toBe('off');
    expect(result.schedule).toBeNull();
    expect(cronState.jobs.map((job) => job.name)).toEqual(['other-job']);
    expect(cronState.autostart).toBe(true);
  });
});
