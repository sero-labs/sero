import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';

const mocks = vi.hoisted(() => ({
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
}));

vi.mock('@electron/features/plugins/dev-sessions/settings', () => ({
  readPluginDevSessionRecords: mocks.readPluginDevSessionRecords,
}));

import { assertPluginInstallAllowed } from '@electron/features/plugins/install-policy';

function createManifest(
  id: string,
  packagePath: string,
): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: null,
    runtimeEntry: null,
    component: null,
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath,
    isPlugin: packagePath.includes('/agent/plugins/'),
    plugin: null,
    contributions: { components: [], controls: [] },
    contributionDiagnostics: [],
  };
}

function createSession(overrides: Partial<PluginDevSessionRecord> = {}): PluginDevSessionRecord {
  return {
    sessionId: 'dev_1',
    sourcePath: '/tmp/dev-plugin',
    expectedAppId: 'todo',
    lastKnownName: 'Todo Dev',
    status: 'active',
    uiMode: 'built-fallback',
    remoteEntryOverride: null,
    lastError: null,
    createdAt: '2026-04-19T20:00:00.000Z',
    updatedAt: '2026-04-19T20:05:00.000Z',
    ...overrides,
  };
}

const INSTALLED_PLUGIN_ROOT = path.join(process.env.HOME ?? '/Users/test', '.sero-ui', 'agent', 'plugins');

describe('plugin install policy', () => {
  beforeEach(() => {
    mocks.readPluginDevSessionRecords.mockReset();
    mocks.readPluginDevSessionRecords.mockReturnValue([]);
  });

  it('allows reinstalling the plugin already installed at the target path', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('todo', path.join(INSTALLED_PLUGIN_ROOT, 'todo'))],
      'todo',
      path.join(INSTALLED_PLUGIN_ROOT, 'todo'),
    )).not.toThrow();
  });

  it('rejects conflicts with built-in apps', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('admin', '/repo/plugins/sero-admin-plugin')],
      'admin',
      path.join(INSTALLED_PLUGIN_ROOT, 'admin'),
    )).toThrow(/already used by built-in app/);
  });

  it('rejects conflicts with a different installed plugin path', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('todo', path.join(INSTALLED_PLUGIN_ROOT, 'todo-old'))],
      'todo',
      path.join(INSTALLED_PLUGIN_ROOT, 'todo'),
    )).toThrow(/already used by installed plugin/);
  });

  it('rejects conflicts with an active local plugin development session', () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createSession(),
    ]);

    expect(() => assertPluginInstallAllowed([], 'todo', path.join(INSTALLED_PLUGIN_ROOT, 'todo'))).toThrow(
      /already owned by active local plugin development session dev_1/,
    );
  });
});
