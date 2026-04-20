import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn<() => Record<string, unknown>>(),
  writeSettings: vi.fn<(settings: Record<string, unknown>) => void>(),
  getSeroSettings: vi.fn<(settings: Record<string, unknown>) => Record<string, unknown>>(),
}));

vi.mock('@electron/shared/settings/settings-helpers', () => ({
  readSettings: mocks.readSettings,
  writeSettings: mocks.writeSettings,
  getSeroSettings: mocks.getSeroSettings,
}));

import {
  readPluginDevSessionRecords,
  writePluginDevSessionRecords,
} from '@electron/features/plugins/dev-sessions/settings';

function createRecord(overrides: Partial<PluginDevSessionRecord> = {}): PluginDevSessionRecord {
  return {
    sessionId: 'dev_1',
    sourcePath: '/tmp/plugin-one',
    expectedAppId: 'plugin-one',
    lastKnownName: 'Plugin One',
    status: 'active',
    uiMode: 'dev-server',
    remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
    lastError: null,
    createdAt: '2026-04-19T20:00:00.000Z',
    updatedAt: '2026-04-19T20:05:00.000Z',
    ...overrides,
  };
}

describe('plugin dev-session settings', () => {
  beforeEach(() => {
    mocks.readSettings.mockReset();
    mocks.writeSettings.mockReset();
    mocks.getSeroSettings.mockReset();
    mocks.getSeroSettings.mockImplementation((settings) => (
      settings.sero && typeof settings.sero === 'object' && !Array.isArray(settings.sero)
        ? settings.sero as Record<string, unknown>
        : {}
    ));
  });

  it('reads persisted records from settings.sero.pluginDev.sessions and ignores invalid entries', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.readSettings.mockReturnValue({
      sero: {
        pluginDev: {
          sessions: {
            dev_1: createRecord(),
            dev_2: {
              ...createRecord({ sessionId: 'dev_2', updatedAt: '2026-04-19T20:10:00.000Z' }),
              status: 'not-real',
              uiMode: 'not-real',
            },
            broken: {
              expectedAppId: 'missing-source',
            },
          },
        },
      },
    });

    expect(readPluginDevSessionRecords()).toEqual([
      createRecord({ sessionId: 'dev_2', status: 'broken', uiMode: 'unavailable', updatedAt: '2026-04-19T20:10:00.000Z' }),
      createRecord(),
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[plugin-dev-settings] Ignoring session "broken": missing sourcePath.',
    );
  });

  it('writes records back into the dedicated pluginDev settings namespace', () => {
    mocks.readSettings.mockReturnValue({
      theme: 'dark',
      sero: {
        existing: true,
      },
    });

    writePluginDevSessionRecords([
      createRecord(),
      createRecord({
        sessionId: 'dev_0',
        sourcePath: '/tmp/plugin-zero',
        expectedAppId: 'plugin-zero',
        lastKnownName: 'Plugin Zero',
        updatedAt: '2026-04-19T19:00:00.000Z',
      }),
    ]);

    expect(mocks.writeSettings).toHaveBeenCalledWith({
      theme: 'dark',
      sero: {
        existing: true,
        pluginDev: {
          sessions: {
            dev_1: {
              sessionId: 'dev_1',
              sourcePath: '/tmp/plugin-one',
              expectedAppId: 'plugin-one',
              lastKnownName: 'Plugin One',
              status: 'active',
              uiMode: 'dev-server',
              remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
              lastError: null,
              createdAt: '2026-04-19T20:00:00.000Z',
              updatedAt: '2026-04-19T20:05:00.000Z',
            },
            dev_0: {
              sessionId: 'dev_0',
              sourcePath: '/tmp/plugin-zero',
              expectedAppId: 'plugin-zero',
              lastKnownName: 'Plugin Zero',
              status: 'active',
              uiMode: 'dev-server',
              remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
              lastError: null,
              createdAt: '2026-04-19T20:00:00.000Z',
              updatedAt: '2026-04-19T19:00:00.000Z',
            },
          },
        },
      },
    });
  });
});
