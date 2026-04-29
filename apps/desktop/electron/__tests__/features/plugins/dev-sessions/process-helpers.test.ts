import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFile,
}));

import { stopStalePortListenersForSourcePath } from '@electron/features/plugins/dev-sessions/process-helpers';

function mockExecFileResponses(outputs: Array<string | Error>): void {
  mocks.execFile.mockImplementation(
    (_command: string, _args: string[], _options: unknown, callback: (...cbArgs: unknown[]) => void) => {
      const next = outputs.shift();
      if (next instanceof Error) {
        callback(next, '');
        return {};
      }

      callback(null, next ?? '');
      return {};
    },
  );
}

describe('stopStalePortListenersForSourcePath', () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
    vi.restoreAllMocks();
  });

  it('kills same-checkout listeners by process group and waits for the port to clear', async () => {
    mockExecFileResponses([
      '101\n',
      'p101\nfcwd\nn/tmp/plugin\n',
      '201\n',
      '',
    ]);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(stopStalePortListenersForSourcePath(5175, '/tmp/plugin')).resolves.toBe(true);

    expect(killSpy).toHaveBeenCalledWith(-201, 'SIGTERM');
  });

  it('refuses to kill listeners that do not belong to the same checkout', async () => {
    mockExecFileResponses([
      '101\n',
      'p101\nfcwd\nn/tmp/other-plugin\n',
      '201\n',
    ]);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(stopStalePortListenersForSourcePath(5175, '/tmp/plugin')).resolves.toBe(false);

    expect(killSpy).not.toHaveBeenCalled();
  });

  it('refuses to kill mixed ownership listeners on the same port', async () => {
    mockExecFileResponses([
      '101\n102\n',
      'p101\nfcwd\nn/tmp/plugin\n',
      '201\n',
      'p102\nfcwd\nn/tmp/other-plugin\n',
      '202\n',
    ]);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(stopStalePortListenersForSourcePath(5175, '/tmp/plugin')).resolves.toBe(false);

    expect(killSpy).not.toHaveBeenCalled();
  });
});
