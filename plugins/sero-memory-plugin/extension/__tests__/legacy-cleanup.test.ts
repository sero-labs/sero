import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeLegacyConsolidationJob } from '../legacy-cleanup';

describe('legacy consolidation job cleanup', () => {
  const originalSeroHome = process.env.SERO_HOME;
  let seroHome = '';
  let statePath = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-cleanup-'));
    statePath = path.join(seroHome, 'apps', 'cron', 'state.json');
    await mkdir(path.dirname(statePath), { recursive: true });
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('removes only the old memory job and keeps the rest of the state', async () => {
    const userJob = { name: 'memory-consolidation', channel: 'user', schedule: '0 9 * * *' };
    await writeFile(statePath, JSON.stringify({
      jobs: [
        { name: 'memory-consolidation', channel: 'memory', schedule: '0 3 * * 0' },
        userJob,
      ],
      reminders: [{ id: 'r1' }],
    }));

    expect(await removeLegacyConsolidationJob()).toBe(true);

    const state = JSON.parse(await readFile(statePath, 'utf8'));
    expect(state.jobs).toEqual([userJob]);
    expect(state.reminders).toEqual([{ id: 'r1' }]);
  });

  it('leaves a missing or unreadable state file alone', async () => {
    expect(await removeLegacyConsolidationJob()).toBe(false);

    await writeFile(statePath, '{ not json');
    expect(await removeLegacyConsolidationJob()).toBe(false);
    expect(await readFile(statePath, 'utf8')).toBe('{ not json');
  });
});
