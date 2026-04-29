import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMemoryLogDirPath, getMemoryLogPath, info } from '../logger';
import { getMemoryLoggingSettingsSync } from '../logger-settings';

const originalEnv = {
  SERO_HOME: process.env.SERO_HOME,
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
};

async function createTempSeroHome(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'sero-memory-logger-'));
}

function getLocalDayStamp(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('memory logger', () => {
  let seroHome = '';

  beforeEach(async () => {
    seroHome = await createTempSeroHome();
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('writes daily logs under ~/.sero-ui/debug/memory using the local day and offset timestamp', async () => {
    info('daily_log_test', { ok: true });
    await vi.waitFor(async () => {
      const content = await readFile(getMemoryLogPath(), 'utf8');
      expect(getMemoryLogDirPath()).toBe(path.join(seroHome, 'debug', 'memory'));
      expect(path.basename(getMemoryLogPath())).toBe(`${getLocalDayStamp(new Date())}.log`);
      expect(content).toContain('daily_log_test');
      expect(content).toContain('{"ok":true}');
      expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} \[INFO\] daily_log_test/m);
    });
  });

  it('reads logging settings from agent/settings.json', async () => {
    const settingsPath = path.join(seroHome, 'agent', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      sero: {
        memory: {
          logging: {
            maxBytesPerFile: 512,
            maxFilesPerDay: 5,
            retentionDays: 30,
            maxPayloadChars: 256,
          },
        },
      },
    }, null, 2));

    expect(getMemoryLoggingSettingsSync()).toEqual({
      maxBytesPerFile: 512,
      maxFilesPerDay: 5,
      retentionDays: 30,
      maxPayloadChars: 256,
    });
  });

  it('truncates oversized payloads using the configured maxPayloadChars', async () => {
    const settingsPath = path.join(seroHome, 'agent', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      sero: {
        memory: {
          logging: {
            maxPayloadChars: 80,
          },
        },
      },
    }, null, 2));

    info('truncation_test', { payload: 'x'.repeat(400) });
    await vi.waitFor(async () => {
      const content = await readFile(getMemoryLogPath(), 'utf8');
      expect(content).toContain('truncation_test');
      expect(content).toContain('[truncated ');
    });
  });

  it('rotates daily logs with a bounded backup count', async () => {
    const settingsPath = path.join(seroHome, 'agent', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      sero: {
        memory: {
          logging: {
            maxBytesPerFile: 120,
            maxFilesPerDay: 2,
            maxPayloadChars: 200,
          },
        },
      },
    }, null, 2));

    info('rotate_1', { payload: 'a'.repeat(80) });
    info('rotate_2', { payload: 'b'.repeat(80) });
    info('rotate_3', { payload: 'c'.repeat(80) });

    await vi.waitFor(async () => {
      const names = await readdir(getMemoryLogDirPath());
      expect(names).toContain(path.basename(getMemoryLogPath()));
      expect(names).toContain(`${path.basename(getMemoryLogPath())}.1`);
      expect(names).toContain(`${path.basename(getMemoryLogPath())}.2`);
    });
  });

  it('prunes daily logs older than the retention window', async () => {
    const settingsPath = path.join(seroHome, 'agent', 'settings.json');
    const logDir = getMemoryLogDirPath();
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await mkdir(logDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      sero: {
        memory: {
          logging: {
            retentionDays: 14,
          },
        },
      },
    }, null, 2));
    await writeFile(path.join(logDir, '2000-01-01.log'), 'stale\n', 'utf8');
    await writeFile(path.join(logDir, '2000-01-01.log.1'), 'stale\n', 'utf8');

    info('retention_test', { ok: true });
    await vi.waitFor(async () => {
      const names = await readdir(logDir);
      expect(names).not.toContain('2000-01-01.log');
      expect(names).not.toContain('2000-01-01.log.1');
      expect(names).toContain(path.basename(getMemoryLogPath()));
    });
  });
});
