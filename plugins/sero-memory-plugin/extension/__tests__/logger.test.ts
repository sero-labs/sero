import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { error } from '../logger';

const originalSeroHome = process.env.SERO_HOME;

function getLocalDayStamp(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('memory error log', () => {
  let seroHome = '';
  let logDir = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-logger-'));
    logDir = path.join(seroHome, 'debug', 'memory');
    process.env.SERO_HOME = seroHome;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('writes errors to the daily log under debug/memory', async () => {
    await error('write_failed', { ok: false });

    const content = await readFile(path.join(logDir, `${getLocalDayStamp(new Date())}.log`), 'utf8');
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} \[ERROR\] write_failed \{"ok":false\}$/m);
  });

  it('prunes daily logs older than the retention window', async () => {
    await mkdir(logDir, { recursive: true });
    await writeFile(path.join(logDir, '2000-01-01.log'), 'stale\n', 'utf8');
    await writeFile(path.join(logDir, '2000-01-01.log.1'), 'stale\n', 'utf8');

    await error('retention_test');

    const names = await readdir(logDir);
    expect(names).not.toContain('2000-01-01.log');
    expect(names).not.toContain('2000-01-01.log.1');
  });
});
