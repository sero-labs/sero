import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn<() => Record<string, unknown>>(),
  writeSettings: vi.fn<(settings: Record<string, unknown>) => void>(),
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
  registerExtAssets: vi.fn<(manifest: SeroAppManifest) => void>(),
  unregisterExtAssets: vi.fn<(appId: string) => void>(),
}));

vi.mock('@electron/features/plugins/settings', () => ({
  readSettings: mocks.readSettings,
  writeSettings: mocks.writeSettings,
  getPackagesArray: (settings: Record<string, unknown>) => Array.isArray(settings.packages) ? settings.packages : [],
}));

vi.mock('@electron/features/plugins/dev-sessions/settings', () => ({
  readPluginDevSessionRecords: mocks.readPluginDevSessionRecords,
}));

vi.mock('@electron/platform/protocols/ext-protocol', () => ({
  registerExtAssets: mocks.registerExtAssets,
  unregisterExtAssets: mocks.unregisterExtAssets,
}));

import {
  reconcileActiveDevSessionExtAssets,
  reconcileActiveDevSessionPackages,
} from '@electron/features/plugins/dev-sessions/activation';

function createSession(overrides: Partial<PluginDevSessionRecord> = {}): PluginDevSessionRecord {
  return {
    sessionId: 'dev_1',
    sourcePath: '/tmp/dev-plugin',
    expectedAppId: 'todo',
    lastKnownName: 'Todo',
    status: 'active',
    uiMode: 'built-fallback',
    remoteEntryOverride: null,
    lastError: null,
    createdAt: '2026-04-19T20:00:00.000Z',
    updatedAt: '2026-04-19T20:05:00.000Z',
    ...overrides,
  };
}

function createManifest(overrides: Partial<SeroAppManifest> = {}): SeroAppManifest {
  return {
    id: 'todo',
    name: 'Todo',
    description: null,
    version: '1.0.0',
    packageName: '@sero/todo',
    icon: 'box',
    stateFile: '.sero/apps/todo/state.json',
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: '/tmp/dev-plugin/dist/ui/remoteEntry.js',
    runtimeEntry: null,
    component: 'TodoApp',
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath: '/tmp/dev-plugin',
    isPlugin: true,
    plugin: null,
    contributions: { components: [], controls: [] },
    contributionDiagnostics: [],
    ...overrides,
  };
}

describe('plugin dev activation projection', () => {
  beforeEach(() => {
    mocks.readSettings.mockReset();
    mocks.writeSettings.mockReset();
    mocks.readPluginDevSessionRecords.mockReset();
    mocks.registerExtAssets.mockReset();
    mocks.unregisterExtAssets.mockReset();
  });

  it('removes projected dev-session paths from settings.packages and appends only active ones', async () => {
    const settings = {
      packages: [
        '/tmp/kept-package',
        '/tmp/dev-plugin',
        '/tmp/broken-plugin',
      ],
      sero: {
        pluginDev: {
          projectedPackagePaths: ['/tmp/dev-plugin', '/tmp/broken-plugin'],
        },
      },
    } satisfies Record<string, unknown>;

    mocks.readSettings.mockReturnValue(settings);
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createSession(),
      createSession({ sessionId: 'dev_2', sourcePath: '/tmp/broken-plugin', status: 'broken', expectedAppId: 'broken' }),
    ]);

    await reconcileActiveDevSessionPackages(['/tmp/dev-plugin']);

    expect(mocks.writeSettings).toHaveBeenCalledWith({
      packages: ['/tmp/kept-package', '/tmp/dev-plugin'],
      sero: {
        pluginDev: {
          projectedPackagePaths: ['/tmp/dev-plugin'],
        },
      },
    });
  });

  it('preserves user-owned package entries when a dev session becomes inactive or broken', async () => {
    const settings = {
      packages: [
        {
          source: '/tmp/dev-plugin',
          include: ['ui'],
        },
        '/tmp/projected-plugin',
      ],
      sero: {
        pluginDev: {
          projectedPackagePaths: ['/tmp/projected-plugin'],
        },
      },
    } satisfies Record<string, unknown>;

    mocks.readSettings.mockReturnValue(settings);
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createSession({ status: 'broken' }),
    ]);

    await reconcileActiveDevSessionPackages([]);

    expect(mocks.writeSettings).toHaveBeenCalledWith({
      packages: [
        {
          source: '/tmp/dev-plugin',
          include: ['ui'],
        },
      ],
      sero: {
        pluginDev: {
          projectedPackagePaths: [],
        },
      },
    });
  });

  it('registers built UI assets for active manifests and unregisters inactive or ui-less sessions', () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createSession(),
      createSession({ sessionId: 'dev_2', expectedAppId: 'notes', sourcePath: '/tmp/notes', status: 'broken' }),
      createSession({ sessionId: 'dev_3', expectedAppId: 'mail', sourcePath: '/tmp/mail', status: 'active' }),
    ]);

    reconcileActiveDevSessionExtAssets([
      createManifest(),
      createManifest({ id: 'mail', packagePath: '/tmp/mail', uiEntry: null, component: null }),
    ]);

    expect(mocks.registerExtAssets).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo' }));
    expect(mocks.unregisterExtAssets).toHaveBeenCalledWith('mail');
    expect(mocks.unregisterExtAssets).toHaveBeenCalledWith('notes');
  });
});
