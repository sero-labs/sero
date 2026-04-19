import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import type { SeroAppManifest } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  discoverAppCandidates: vi.fn<() => Promise<SeroAppManifest[]>>(),
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
  writePluginDevSessionRecords: vi.fn<(records: Iterable<PluginDevSessionRecord>) => void>(),
  validatePluginDevSourceManifest: vi.fn(),
  classifyPluginDevConflicts: vi.fn(),
  reconcileActiveDevSessionProjection: vi.fn<() => Promise<void>>(),
}));

vi.mock('@electron/features/apps/discovery', () => ({
  discoverAppCandidates: mocks.discoverAppCandidates,
}));

vi.mock('@electron/features/plugins/dev-sessions/settings', () => ({
  readPluginDevSessionRecords: mocks.readPluginDevSessionRecords,
  writePluginDevSessionRecords: mocks.writePluginDevSessionRecords,
}));

vi.mock('@electron/features/plugins/dev-sessions/manifest', () => ({
  validatePluginDevSourceManifest: mocks.validatePluginDevSourceManifest,
}));

vi.mock('@electron/features/plugins/dev-sessions/conflicts', () => ({
  classifyPluginDevConflicts: mocks.classifyPluginDevConflicts,
}));

vi.mock('@electron/features/plugins/dev-sessions/activation', () => ({
  reconcileActiveDevSessionProjection: mocks.reconcileActiveDevSessionProjection,
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

function createManifest(id: string, packagePath: string): SeroAppManifest {
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
    isPlugin: true,
    plugin: null,
    widgets: [],
  };
}

describe('PluginDevSessionManager', () => {
  beforeEach(() => {
    mocks.discoverAppCandidates.mockReset();
    mocks.readPluginDevSessionRecords.mockReset();
    mocks.writePluginDevSessionRecords.mockReset();
    mocks.validatePluginDevSourceManifest.mockReset();
    mocks.classifyPluginDevConflicts.mockReset();
    mocks.reconcileActiveDevSessionProjection.mockReset();

    mocks.discoverAppCandidates.mockResolvedValue([]);
    mocks.classifyPluginDevConflicts.mockReturnValue([]);
    mocks.reconcileActiveDevSessionProjection.mockResolvedValue();
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
    mocks.validatePluginDevSourceManifest.mockImplementation(async (sourcePath: string) => ({
      sourcePath,
      manifest: createManifest(pathToId(sourcePath), sourcePath),
      declaredDevPort: undefined,
      hasDevScript: false,
    }));

    const manager = new PluginDevSessionManager();
    const [list] = await Promise.all([
      manager.list(),
      manager.initialize(),
      manager.initialize(),
    ]);

    expect(mocks.readPluginDevSessionRecords).toHaveBeenCalledTimes(1);
    expect(mocks.discoverAppCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.writePluginDevSessionRecords).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledTimes(1);
    expect(list.map((record) => record.sessionId).sort()).toEqual(['dev_1', 'dev_2']);

    await manager.initialize();
    expect(mocks.readPluginDevSessionRecords).toHaveBeenCalledTimes(1);
  });

  it('marks invalid persisted sessions broken and keeps valid ones projected', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([
      createRecord(),
      createRecord({ sessionId: 'dev_2', sourcePath: '/tmp/missing-plugin', expectedAppId: 'missing-plugin' }),
    ]);
    mocks.validatePluginDevSourceManifest.mockImplementation(async (sourcePath: string) => {
      if (sourcePath === '/tmp/missing-plugin') {
        throw new Error('Local plugin folder is missing package.json: /tmp/missing-plugin');
      }

      return {
        sourcePath,
        manifest: createManifest('plugin-one', sourcePath),
        declaredDevPort: undefined,
        hasDevScript: false,
      };
    });

    const manager = new PluginDevSessionManager();
    const list = await manager.list();

    expect(list).toHaveLength(2);
    expect(list.find((record) => record.sessionId === 'dev_2')).toEqual(
      expect.objectContaining({ status: 'broken', lastError: expect.stringContaining('missing package.json') }),
    );
    expect(list.find((record) => record.sessionId === 'dev_1')).toEqual(
      expect.objectContaining({ status: 'active', expectedAppId: 'plugin-one' }),
    );
    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'plugin-one', packagePath: '/tmp/plugin-one' }),
    ]);
  });
});

function pathToId(sourcePath: string): string {
  return sourcePath.split('/').pop() ?? 'unknown-plugin';
}
