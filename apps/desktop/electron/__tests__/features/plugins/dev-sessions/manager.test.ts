import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import type { SeroAppManifest } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  discoverAppCandidates: vi.fn<() => Promise<SeroAppManifest[]>>(),
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
  writePluginDevSessionRecords: vi.fn<(records: Iterable<PluginDevSessionRecord>) => void>(),
  validatePluginDevSourceManifest: vi.fn(),
  applyPluginDevServerResultToManifest: vi.fn((manifest: SeroAppManifest) => manifest),
  classifyPluginDevConflicts: vi.fn(),
  ensurePluginDevServer: vi.fn(),
  stopPluginDevServer: vi.fn<() => Promise<void>>(),
  reconcileActiveDevSessionProjection: vi.fn<() => Promise<void>>(),
  createBrokenPluginDevSessionRecord: vi.fn(
    (record: PluginDevSessionRecord, error: unknown): PluginDevSessionRecord => ({
      ...record,
      status: 'broken',
      uiMode: 'unavailable',
      remoteEntryOverride: null,
      lastError: error instanceof Error ? error.message : 'unknown error',
      updatedAt: '2026-04-19T21:00:00.000Z',
    }),
  ),
  createValidatedPluginDevSessionRecord: vi.fn(
    (
      record: PluginDevSessionRecord,
      options: {
        manifest: SeroAppManifest;
        remoteEntryOverride: string | null;
        uiMode: PluginDevSessionRecord['uiMode'];
        error?: string | null;
      },
    ): PluginDevSessionRecord => ({
      ...record,
      expectedAppId: options.manifest.id,
      lastKnownName: options.manifest.name,
      status: options.error ? 'needs-attention' : 'active',
      uiMode: options.uiMode,
      remoteEntryOverride: options.remoteEntryOverride,
      lastError: options.error ?? null,
      updatedAt: '2026-04-19T21:00:00.000Z',
    }),
  ),
  createSoftFailurePluginDevSessionRecord: vi.fn(
    (record: PluginDevSessionRecord, error: unknown): PluginDevSessionRecord => ({
      ...record,
      status: record.status === 'broken' ? 'broken' : 'needs-attention',
      lastError: error instanceof Error ? error.message : 'unknown error',
      updatedAt: '2026-04-19T21:00:00.000Z',
    }),
  ),
  refreshPluginDevSession: vi.fn(),
  applyPluginDevSessionRefreshEffects: vi.fn<() => Promise<void>>(),
  watcher: {
    watch: vi.fn<(sessionId: string, sourcePath: string) => void>(),
    unwatch: vi.fn<(sessionId: string) => void>(),
    dispose: vi.fn<() => void>(),
  },
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
  applyPluginDevServerResultToManifest: mocks.applyPluginDevServerResultToManifest,
}));

vi.mock('@electron/features/plugins/dev-sessions/conflicts', () => ({
  classifyPluginDevConflicts: mocks.classifyPluginDevConflicts,
}));

vi.mock('@electron/features/plugins/dev-sessions/dev-server', () => ({
  ensurePluginDevServer: mocks.ensurePluginDevServer,
  stopPluginDevServer: mocks.stopPluginDevServer,
}));

vi.mock('@electron/features/plugins/dev-sessions/activation', () => ({
  reconcileActiveDevSessionProjection: mocks.reconcileActiveDevSessionProjection,
}));

vi.mock('@electron/features/plugins/dev-sessions/refresh', () => ({
  createBrokenPluginDevSessionRecord: mocks.createBrokenPluginDevSessionRecord,
  createValidatedPluginDevSessionRecord: mocks.createValidatedPluginDevSessionRecord,
  createSoftFailurePluginDevSessionRecord: mocks.createSoftFailurePluginDevSessionRecord,
  refreshPluginDevSession: mocks.refreshPluginDevSession,
  applyPluginDevSessionRefreshEffects: mocks.applyPluginDevSessionRefreshEffects,
}));

vi.mock('@electron/features/plugins/dev-sessions/watcher', () => ({
  PluginDevSessionWatcher: class {
    constructor() {
      return mocks.watcher;
    }
  },
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
    runtimeExternals: [],
    packagePath,
    isPlugin: true,
    plugin: null,
    hostCompatibility: null,
    widgets: [],
  };
}

describe('PluginDevSessionManager', () => {
  beforeEach(() => {
    mocks.discoverAppCandidates.mockReset();
    mocks.readPluginDevSessionRecords.mockReset();
    mocks.writePluginDevSessionRecords.mockReset();
    mocks.validatePluginDevSourceManifest.mockReset();
    mocks.applyPluginDevServerResultToManifest.mockReset();
    mocks.classifyPluginDevConflicts.mockReset();
    mocks.ensurePluginDevServer.mockReset();
    mocks.stopPluginDevServer.mockReset();
    mocks.reconcileActiveDevSessionProjection.mockReset();
    mocks.createBrokenPluginDevSessionRecord.mockClear();
    mocks.createValidatedPluginDevSessionRecord.mockClear();
    mocks.createSoftFailurePluginDevSessionRecord.mockClear();
    mocks.refreshPluginDevSession.mockReset();
    mocks.applyPluginDevSessionRefreshEffects.mockReset();
    mocks.watcher.watch.mockReset();
    mocks.watcher.unwatch.mockReset();
    mocks.watcher.dispose.mockReset();

    mocks.discoverAppCandidates.mockResolvedValue([]);
    mocks.applyPluginDevServerResultToManifest.mockImplementation((manifest: SeroAppManifest) => manifest);
    mocks.classifyPluginDevConflicts.mockReturnValue([]);
    mocks.ensurePluginDevServer.mockResolvedValue({
      remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
      uiMode: 'dev-server',
      error: null,
    });
    mocks.stopPluginDevServer.mockResolvedValue();
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
      declaredDevPort: 5193,
      devCommand: 'pnpm run dev',
      hasDeclaredUi: true,
      hasBuiltUi: true,
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
    expect(mocks.ensurePluginDevServer).toHaveBeenCalledTimes(2);
    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledTimes(1);
    expect(mocks.watcher.watch).toHaveBeenCalledTimes(2);
    expect(list.map((record) => record.sessionId).sort()).toEqual(['dev_1', 'dev_2']);

    await manager.initialize();
    expect(mocks.readPluginDevSessionRecords).toHaveBeenCalledTimes(1);
  });

  it('keeps degraded sessions active with built fallback state when dev server startup fails', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([createRecord()]);
    mocks.validatePluginDevSourceManifest.mockResolvedValue({
      sourcePath: '/tmp/plugin-one',
      manifest: createManifest('plugin-one', '/tmp/plugin-one'),
      declaredDevPort: 5193,
      devCommand: 'pnpm run dev',
      hasDeclaredUi: true,
      hasBuiltUi: true,
    });
    mocks.ensurePluginDevServer.mockResolvedValue({
      remoteEntryOverride: null,
      uiMode: 'built-fallback',
      error: 'Dev server start failed for "pnpm run dev": port never became healthy.',
    });

    const manager = new PluginDevSessionManager();
    const [record] = await manager.list();

    expect(record).toEqual(expect.objectContaining({
      status: 'needs-attention',
      uiMode: 'built-fallback',
      remoteEntryOverride: null,
      lastError: expect.stringContaining('port never became healthy'),
    }));
    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'plugin-one', packagePath: '/tmp/plugin-one' }),
    ]);
    expect(mocks.watcher.watch).toHaveBeenCalledWith('dev_1', '/tmp/plugin-one');
  });

  it('starts a new session, persists it, and emits generic change effects', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([]);
    mocks.ensurePluginDevServer.mockResolvedValue({
      remoteEntryOverride: null,
      uiMode: 'backend-only',
      error: null,
    });
    mocks.validatePluginDevSourceManifest.mockResolvedValue({
      sourcePath: '/tmp/plugin-one',
      manifest: createManifest('plugin-one', '/tmp/plugin-one'),
      declaredDevPort: undefined,
      devCommand: null,
      hasDeclaredUi: false,
      hasBuiltUi: false,
    });

    const manager = new PluginDevSessionManager();
    const record = await manager.start('/tmp/plugin-one');

    expect(record).toEqual(expect.objectContaining({
      sourcePath: '/tmp/plugin-one',
      expectedAppId: 'plugin-one',
      status: 'active',
      uiMode: 'backend-only',
    }));
    expect(mocks.writePluginDevSessionRecords).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionId: record.sessionId,
        sourcePath: '/tmp/plugin-one',
      }),
    ]);
    expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenCalledWith({
      activeManifests: [expect.objectContaining({ id: 'plugin-one', packagePath: '/tmp/plugin-one' })],
      appId: 'plugin-one',
      event: expect.objectContaining({
        type: 'changed',
        pluginId: 'plugin-one',
        reason: 'dev-session-started',
      }),
    });
    expect(mocks.watcher.watch).toHaveBeenCalledWith(record.sessionId, '/tmp/plugin-one');
    expect(mocks.stopPluginDevServer).toHaveBeenCalledWith('/tmp/plugin-one');
  });

  it('stops active sessions and tears down their projected state', async () => {
    mocks.readPluginDevSessionRecords.mockReturnValue([createRecord()]);
    mocks.validatePluginDevSourceManifest.mockResolvedValue({
      sourcePath: '/tmp/plugin-one',
      manifest: createManifest('plugin-one', '/tmp/plugin-one'),
      declaredDevPort: 5193,
      devCommand: 'pnpm run dev',
      hasDeclaredUi: true,
      hasBuiltUi: true,
    });

    const manager = new PluginDevSessionManager();
    await manager.initialize();
    await manager.stop('dev_1');

    expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenCalledWith({
      activeManifests: [],
      appId: 'plugin-one',
      event: {
        type: 'changed',
        pluginId: 'plugin-one',
        reason: 'dev-session-stopped',
      },
    });
    expect(mocks.writePluginDevSessionRecords).toHaveBeenLastCalledWith([]);
    expect(mocks.watcher.unwatch).toHaveBeenCalledWith('dev_1');
    expect(mocks.stopPluginDevServer).toHaveBeenCalledWith('/tmp/plugin-one');
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
        devCommand: null,
        hasDeclaredUi: false,
        hasBuiltUi: false,
      };
    });
    mocks.ensurePluginDevServer.mockResolvedValue({
      remoteEntryOverride: null,
      uiMode: 'backend-only',
      error: null,
    });

    const manager = new PluginDevSessionManager();
    const list = await manager.list();

    expect(list).toHaveLength(2);
    expect(list.find((record) => record.sessionId === 'dev_2')).toEqual(
      expect.objectContaining({ status: 'broken', lastError: expect.stringContaining('missing package.json') }),
    );
    expect(list.find((record) => record.sessionId === 'dev_1')).toEqual(
      expect.objectContaining({ status: 'active', expectedAppId: 'plugin-one', uiMode: 'backend-only' }),
    );
    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'plugin-one', packagePath: '/tmp/plugin-one' }),
    ]);
    expect(mocks.watcher.unwatch).toHaveBeenCalledWith('dev_2');
  });
});

function pathToId(sourcePath: string): string {
  return sourcePath.split('/').pop() ?? 'unknown-plugin';
}
