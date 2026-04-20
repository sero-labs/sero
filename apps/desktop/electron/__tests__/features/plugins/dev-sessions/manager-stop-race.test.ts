import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import type { SeroAppManifest } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  discoverAppCandidates: vi.fn<() => Promise<SeroAppManifest[]>>(),
  readPluginDevSessionRecords: vi.fn<() => PluginDevSessionRecord[]>(),
  writePluginDevSessionRecords: vi.fn<(records: Iterable<PluginDevSessionRecord>) => void>(),
  validatePluginDevSourceManifest: vi.fn(),
  applyPluginDevServerResultToManifest: vi.fn((manifest: SeroAppManifest) => manifest),
  classifyPluginDevConflicts: vi.fn(() => []),
  ensurePluginDevServer: vi.fn(),
  stopPluginDevServer: vi.fn<() => Promise<void>>(),
  stopAllPluginDevServers: vi.fn<() => Promise<void>>(),
  createBrokenPluginDevSessionRecord: vi.fn(
    (record: PluginDevSessionRecord, error: unknown): PluginDevSessionRecord => ({
      ...record,
      status: 'broken',
      uiMode: 'unavailable',
      remoteEntryOverride: null,
      lastError: error instanceof Error ? error.message : 'unknown error',
      updatedAt: '2026-04-20T00:20:00.000Z',
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
      updatedAt: '2026-04-20T00:20:00.000Z',
    }),
  ),
  createSoftFailurePluginDevSessionRecord: vi.fn(
    (record: PluginDevSessionRecord, error: unknown): PluginDevSessionRecord => ({
      ...record,
      status: record.status === 'broken' ? 'broken' : 'needs-attention',
      lastError: error instanceof Error ? error.message : 'unknown error',
      updatedAt: '2026-04-20T00:20:00.000Z',
    }),
  ),
  refreshPluginDevSession: vi.fn(),
  applyPluginDevSessionRefreshEffects: vi.fn<() => Promise<void>>(),
  reconcileActiveDevSessionProjection: vi.fn<() => Promise<void>>(),
  broadcastPluginEvent: vi.fn<(event: unknown) => void>(),
  watcher: {
    watch: vi.fn<(sessionId: string, sourcePath: string) => void>(),
    unwatch: vi.fn<(sessionId: string) => void>(),
    dispose: vi.fn<() => void>(),
  },
}));

vi.mock('@electron/features/apps/discovery', () => ({
  discoverAppCandidates: mocks.discoverAppCandidates,
}));

vi.mock('@electron/ipc/integrations/plugin-events', () => ({
  broadcastPluginEvent: mocks.broadcastPluginEvent,
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
  stopAllPluginDevServers: mocks.stopAllPluginDevServers,
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

function createManifest(id = 'plugin-one'): SeroAppManifest {
  return {
    id,
    name: 'Plugin One',
    description: null,
    version: '1.0.0',
    packageName: '@sero/plugin-one',
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
    packagePath: '/tmp/plugin-one',
    isPlugin: true,
    plugin: null,
    hostCompatibility: null,
    widgets: [],
  };
}

function createValidationResult(manifest = createManifest()) {
  return {
    sourcePath: manifest.packagePath,
    manifest,
    declaredDevPort: undefined,
    devCommand: null,
    hasDeclaredUi: false,
    hasBuiltUi: false,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.discoverAppCandidates.mockReset();
  mocks.readPluginDevSessionRecords.mockReset();
  mocks.writePluginDevSessionRecords.mockReset();
  mocks.validatePluginDevSourceManifest.mockReset();
  mocks.applyPluginDevServerResultToManifest.mockReset();
  mocks.classifyPluginDevConflicts.mockReset();
  mocks.ensurePluginDevServer.mockReset();
  mocks.stopPluginDevServer.mockReset();
  mocks.stopAllPluginDevServers.mockReset();
  mocks.createBrokenPluginDevSessionRecord.mockClear();
  mocks.createValidatedPluginDevSessionRecord.mockClear();
  mocks.createSoftFailurePluginDevSessionRecord.mockClear();
  mocks.refreshPluginDevSession.mockReset();
  mocks.applyPluginDevSessionRefreshEffects.mockReset();
  mocks.reconcileActiveDevSessionProjection.mockReset();
  mocks.broadcastPluginEvent.mockReset();
  mocks.watcher.watch.mockReset();
  mocks.watcher.unwatch.mockReset();
  mocks.watcher.dispose.mockReset();

  mocks.discoverAppCandidates.mockResolvedValue([]);
  mocks.readPluginDevSessionRecords.mockReturnValue([]);
  mocks.applyPluginDevServerResultToManifest.mockImplementation((manifest: SeroAppManifest) => manifest);
  mocks.classifyPluginDevConflicts.mockReturnValue([]);
  mocks.ensurePluginDevServer.mockResolvedValue({
    remoteEntryOverride: null,
    uiMode: 'backend-only',
    error: null,
  });
  mocks.stopPluginDevServer.mockResolvedValue();
  mocks.stopAllPluginDevServers.mockResolvedValue();
  mocks.applyPluginDevSessionRefreshEffects.mockResolvedValue();
  mocks.reconcileActiveDevSessionProjection.mockResolvedValue();
});

describe('PluginDevSessionManager sequencing', () => {
  it('waits for an in-flight refresh before removing the session so it cannot be resurrected', async () => {
    const manifest = createManifest();
    mocks.validatePluginDevSourceManifest.mockResolvedValue(createValidationResult(manifest));

    const manager = new PluginDevSessionManager();
    const started = await manager.start('/tmp/plugin-one');

    const refreshEffects = createDeferred<void>();
    const refreshedRecord: PluginDevSessionRecord = {
      ...started,
      updatedAt: '2026-04-20T00:15:00.000Z',
    };
    mocks.refreshPluginDevSession.mockResolvedValue({
      effect: 'updated',
      record: refreshedRecord,
      activeManifest: manifest,
      appId: manifest.id,
      event: {
        type: 'changed',
        pluginId: manifest.id,
        manifest,
        reason: 'dev-session-refreshed',
      },
    });
    mocks.applyPluginDevSessionRefreshEffects.mockReset();
    mocks.applyPluginDevSessionRefreshEffects
      .mockImplementationOnce(() => refreshEffects.promise)
      .mockResolvedValueOnce();

    const refreshPromise = manager.refresh(started.sessionId);
    await vi.waitFor(() => {
      expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenCalledTimes(1);
    });

    let stopSettled = false;
    const stopPromise = manager.stop(started.sessionId).then(() => {
      stopSettled = true;
    });

    await Promise.resolve();
    expect(stopSettled).toBe(false);

    refreshEffects.resolve();
    await refreshPromise;
    await stopPromise;

    await expect(manager.list()).resolves.toEqual([]);
    expect(mocks.writePluginDevSessionRecords).toHaveBeenLastCalledWith([]);
    expect(mocks.watcher.unwatch).toHaveBeenCalledWith(started.sessionId);
  });

  it('serializes concurrent starts for the same source path so only one session record survives', async () => {
    const manifest = createManifest();
    const startEffects = createDeferred<void>();
    mocks.validatePluginDevSourceManifest.mockResolvedValue(createValidationResult(manifest));
    mocks.applyPluginDevSessionRefreshEffects
      .mockImplementationOnce(() => startEffects.promise)
      .mockResolvedValueOnce();

    const manager = new PluginDevSessionManager();
    const firstStart = manager.start('/tmp/plugin-one');
    await vi.waitFor(() => {
      expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenCalledTimes(1);
    });

    const secondStart = manager.start('/tmp/plugin-one');
    await Promise.resolve();
    expect(mocks.validatePluginDevSourceManifest).toHaveBeenCalledTimes(1);

    startEffects.resolve();
    const [first, second] = await Promise.all([firstStart, secondStart]);

    expect(first.sessionId).toBe(second.sessionId);
    expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenNthCalledWith(1, expect.objectContaining({
      event: expect.objectContaining({ reason: 'dev-session-started' }),
    }));
    expect(mocks.applyPluginDevSessionRefreshEffects).toHaveBeenNthCalledWith(2, expect.objectContaining({
      event: expect.objectContaining({ reason: 'dev-session-refreshed' }),
    }));
    expect(mocks.writePluginDevSessionRecords).toHaveBeenLastCalledWith([
      expect.objectContaining({ sessionId: first.sessionId, sourcePath: '/tmp/plugin-one' }),
    ]);
    await expect(manager.list()).resolves.toEqual([
      expect.objectContaining({ sessionId: first.sessionId, sourcePath: '/tmp/plugin-one' }),
    ]);
  });

  it('stops a newly started dev server when start rolls back after refresh effects fail', async () => {
    const manifest = createManifest();
    mocks.validatePluginDevSourceManifest.mockResolvedValue({
      ...createValidationResult(manifest),
      declaredDevPort: 5193,
      devCommand: 'pnpm run dev',
      hasDeclaredUi: true,
      hasBuiltUi: true,
    });
    mocks.ensurePluginDevServer.mockResolvedValue({
      remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
      uiMode: 'dev-server',
      error: null,
    });
    mocks.applyPluginDevSessionRefreshEffects.mockRejectedValueOnce(new Error('refresh effects failed'));

    const manager = new PluginDevSessionManager();
    await expect(manager.start('/tmp/plugin-one')).rejects.toThrow('refresh effects failed');

    await vi.waitFor(() => {
      expect(mocks.stopPluginDevServer).toHaveBeenCalledWith('/tmp/plugin-one');
    });
    expect(mocks.writePluginDevSessionRecords).toHaveBeenLastCalledWith([]);
    await expect(manager.list()).resolves.toEqual([]);
  });
});
