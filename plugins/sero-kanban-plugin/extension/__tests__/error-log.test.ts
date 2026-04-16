import { afterEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(async (filePath: string) => {
      await delay(5);
      const value = files.get(filePath);
      if (value == null) {
        const error = new Error(`ENOENT: ${filePath}`) as Error & { code?: string };
        error.code = 'ENOENT';
        throw error;
      }
      return value;
    }),
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async (filePath: string, data: string) => {
      await delay(5);
      files.set(filePath, data);
    }),
    rename: vi.fn(async (fromPath: string, toPath: string) => {
      await delay(5);
      const value = files.get(fromPath);
      if (value == null) {
        throw new Error(`missing temp file: ${fromPath}`);
      }
      files.set(toPath, value);
      files.delete(fromPath);
    }),
  },
}));

afterEach(() => {
  files.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('appendError', () => {
  it('serializes concurrent appends so no reports are lost', async () => {
    const { appendError, readErrorLog } = await import('../error-log');
    const statePath = '/workspace/.sero/apps/kanban/state.json';

    await Promise.all([
      appendError(statePath, {
        cardId: '1',
        cardTitle: 'First card',
        phase: 'review',
        agentName: 'alpha',
        severity: 'warning',
        message: 'first failure',
      }),
      appendError(statePath, {
        cardId: '1',
        cardTitle: 'First card',
        phase: 'review',
        agentName: 'beta',
        severity: 'error',
        message: 'second failure',
      }),
      appendError(statePath, {
        cardId: '2',
        cardTitle: 'Second card',
        phase: 'implementation',
        agentName: 'gamma',
        severity: 'test-failure',
        message: 'third failure',
      }),
    ]);

    const log = await readErrorLog(statePath);
    expect(log.errors).toHaveLength(3);
    expect(log.errors.map((entry) => entry.message).sort()).toEqual([
      'first failure',
      'second failure',
      'third failure',
    ]);
  });

  it('fails loud when the persisted error log is malformed', async () => {
    const { readErrorLog } = await import('../error-log');
    const statePath = '/workspace/.sero/apps/kanban/state.json';
    files.set('/workspace/.sero/apps/kanban/errors.json', '{not-json');

    await expect(readErrorLog(statePath)).rejects.toThrow(/Kanban error log/);
  });
});
