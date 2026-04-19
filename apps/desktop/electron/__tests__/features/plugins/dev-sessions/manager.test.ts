import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';

const mocks = vi.hoisted(() => ({
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
}));

vi.mock('@electron/features/plugins/dev-sessions/settings', () => ({
  readPluginDevSessionRecords: mocks.readPluginDevSessionRecords,
}));

import { PluginDevSessionManager } from '@electron/features/plugins/dev-sessions/manager';

function createRecord(overrides: Partial<PluginDevSessionRecord> = {}): PluginDevSessionRecord {
  return {
    sessionId: 'dev_1',
    sourcePath: '/tmp/plugin-one',
    expectedAppId: 'plugin-one',
    lastKnownName: 'Plugin One',
    status: 'active',
    uiMode: 'dev-server',
    remoteEntryOverride: null,
    lastError: null,
    createdAt: '2026-04-19T20:00:00.000Z',
    updatedAt: '2026-04-19T20:05:00.000Z',
    ...overrides,
  };
}

describe('PluginDevSessionManager', () => {
  beforeEach(() => {
    mocks.readPluginDevSessionRecords.mockReset();
  });

  it('bootstraps persisted sessions once even when initialize/list race', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createRecord(),
      createRecord({
        sessionId: 'dev_2',
        sourcePath: '/tmp/plugin-two',
        expectedAppId: 'plugin-two',
        lastKnownName: 'Plugin Two',
        updatedAt: '2026-04-19T20:10:00.000Z',
      }),
    ]);

    const manager = new PluginDevSessionManager();
    const [list] = await Promise.all([
      manager.list(),
      manager.initialize(),
      manager.initialize(),
    ]);

    expect(mocks.readPluginDevSessionRecords).toHaveBeenCalledTimes(1);
    expect(list.map((record) => record.sessionId)).toEqual(['dev_2', 'dev_1']);

    await manager.initialize();
    expect(mocks.readPluginDevSessionRecords).toHaveBeenCalledTimes(1);
  });

  it('returns cloned records so callers cannot mutate manager state', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([createRecord()]);

    const manager = new PluginDevSessionManager();
    const first = await manager.list();
    first[0]!.lastKnownName = 'Mutated';

    const second = await manager.list();

    expect(second[0]?.lastKnownName).toBe('Plugin One');
  });
});
