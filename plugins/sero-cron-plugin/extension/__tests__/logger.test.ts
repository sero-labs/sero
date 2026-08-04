import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLoggerApi() {
  return {
    events: {
      emit: vi.fn(),
    },
  };
}

describe('logger', () => {
  let tempDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'sero-cron-logger-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes log lines asynchronously to the cron log file', async () => {
    vi.resetModules();
    const { flushLoggerWrites, info, initLogger } = await import('../logger');
    const api = createLoggerApi();
    const statePath = path.join(tempDir, 'state.json');

    initLogger(api, statePath);
    info('scheduler:start', { jobs: 2 });
    await flushLoggerWrites();

    const logFile = path.join(tempDir, 'cron.log');
    const contents = await readFile(logFile, 'utf8');

    expect(contents).toContain('[INFO] scheduler:start {"jobs":2}');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[cron]'),
    );
    expect(api.events.emit).toHaveBeenCalledWith(
      'log',
      expect.objectContaining({
        channel: 'cron',
        event: 'scheduler:start',
        level: 'INFO',
      }),
    );
  });

  it('surfaces file logging failures once without throwing', async () => {
    vi.resetModules();
    const { flushLoggerWrites, info, initLogger } = await import('../logger');
    const api = createLoggerApi();
    const blockedPath = path.join(tempDir, 'blocked');

    await writeFile(blockedPath, 'not-a-directory', 'utf8');

    initLogger(api, path.join(blockedPath, 'state.json'));
    info('scheduler:start', { jobs: 1 });
    info('scheduler:tick', { minute: '2026-04-14T12:00:00.000Z' });
    await flushLoggerWrites();

    const fileWarnings = consoleWarnSpy.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('file logging unavailable'),
    );

    expect(fileWarnings).toHaveLength(1);
    expect(api.events.emit).toHaveBeenCalledWith(
      'log',
      expect.objectContaining({
        channel: 'cron',
        event: 'logger:file-unavailable',
        level: 'WARN',
      }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
