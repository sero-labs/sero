import path from 'path';
import type { SeroAppManifest } from '@/types/ipc';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import {
  classifyPluginDevConflicts,
  getActivePluginDevSessionRecords,
} from '@electron/features/plugins/dev-sessions/conflicts';
import { describe, expect, it } from 'vitest';

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

describe('plugin dev conflicts', () => {
  it('classifies built-in apps, installed plugins, and active dev sessions explicitly', () => {
    const conflicts = classifyPluginDevConflicts({
      appId: 'todo',
      sourcePath: '/tmp/next-dev-plugin',
      existingApps: [
        createManifest('todo', '/repo/plugins/sero-todo-plugin'),
        createManifest('todo', path.join(INSTALLED_PLUGIN_ROOT, 'todo')),
      ],
      sessionRecords: [
        createSession(),
      ],
    });

    expect(conflicts).toEqual([
      expect.objectContaining({ kind: 'active-dev-session', ownerSessionId: 'dev_1' }),
      expect.objectContaining({ kind: 'built-in-app', ownerPath: '/repo/plugins/sero-todo-plugin' }),
      expect.objectContaining({ kind: 'installed-plugin', ownerPath: path.join(INSTALLED_PLUGIN_ROOT, 'todo') }),
    ]);
  });

  it('treats only non-broken records as active and ignores the owning session/source path', () => {
    const sessionRecords = [
      createSession(),
      createSession({ sessionId: 'dev_2', status: 'broken', sourcePath: '/tmp/broken-plugin' }),
    ];

    expect(getActivePluginDevSessionRecords(sessionRecords).map((record) => record.sessionId)).toEqual(['dev_1']);
    expect(classifyPluginDevConflicts({
      appId: 'todo',
      sourcePath: '/tmp/dev-plugin',
      ignoreSessionId: 'dev_1',
      existingApps: [createManifest('todo', '/tmp/dev-plugin')],
      sessionRecords,
    })).toEqual([]);
  });
});
