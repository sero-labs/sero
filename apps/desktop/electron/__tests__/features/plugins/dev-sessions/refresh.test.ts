import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDevSessionRecord } from '@electron/features/plugins/dev-sessions/types';
import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  discoverAppCandidates: vi.fn<() => Promise<SeroAppManifest[]>>(),
  classifyPluginDevConflicts: vi.fn(),
  validatePluginDevSourceManifest: vi.fn(),
  applyPluginDevServerResultToManifest: vi.fn((manifest: SeroAppManifest) => manifest),
  ensurePluginDevServer: vi.fn(),
  stopPluginDevServer: vi.fn<() => Promise<void>>(),
  reconcileActiveDevSessionProjection: vi.fn<() => Promise<void>>(),
  clearAppManifestCache: vi.fn(),
  disposeAppSessionsForApp: vi.fn(),
  reloadAllSessionResources: vi.fn<() => Promise<void>>(),
  restartApp: vi.fn<() => Promise<void>>(),
  clearPluginBridgePolicyCache: vi.fn(),
  clearPackageCompatibilityCache: vi.fn(),
  invalidatePackageProviderManifestCache: vi.fn(),
  broadcastPluginEvent: vi.fn(),
}));

vi.mock('@electron/features/apps/discovery', () => ({
  discoverAppCandidates: mocks.discoverAppCandidates,
}));

vi.mock('@electron/features/plugins/dev-sessions/conflicts', () => ({
  classifyPluginDevConflicts: mocks.classifyPluginDevConflicts,
}));

vi.mock('@electron/features/plugins/dev-sessions/manifest', () => ({
  validatePluginDevSourceManifest: mocks.validatePluginDevSourceManifest,
  applyPluginDevServerResultToManifest: mocks.applyPluginDevServerResultToManifest,
}));

vi.mock('@electron/features/plugins/dev-sessions/dev-server', () => ({
  ensurePluginDevServer: mocks.ensurePluginDevServer,
  stopPluginDevServer: mocks.stopPluginDevServer,
}));

vi.mock('@electron/features/plugins/dev-sessions/activation', () => ({
  reconcileActiveDevSessionProjection: mocks.reconcileActiveDevSessionProjection,
}));

vi.mock('@electron/ipc/agent/handlers/app-agent', () => ({
  clearAppManifestCache: mocks.clearAppManifestCache,
  disposeAppSessionsForApp: mocks.disposeAppSessionsForApp,
}));

vi.mock('@electron/ipc/agent', () => ({
  reloadAllSessionResources: mocks.reloadAllSessionResources,
}));

vi.mock('@electron/features/apps/runtime/manager', () => ({
  appRuntimeManager: {
    restartApp: mocks.restartApp,
  },
}));

vi.mock('@electron/cli', () => ({
  clearPluginBridgePolicyCache: mocks.clearPluginBridgePolicyCache,
}));

vi.mock('@electron/features/plugins/resource-compatibility', () => ({
  clearPackageCompatibilityCache: mocks.clearPackageCompatibilityCache,
}));

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  invalidatePackageProviderManifestCache: mocks.invalidatePackageProviderManifestCache,
}));

vi.mock('@electron/ipc/integrations/plugin-events', () => ({
  broadcastPluginEvent: mocks.broadcastPluginEvent,
}));

import {
  applyPluginDevSessionRefreshEffects,
  refreshPluginDevSession,
} from '@electron/features/plugins/dev-sessions/refresh';

let tempDirs: string[] = [];

function createRecord(sourcePath: string, overrides: Partial<PluginDevSessionRecord> = {}): PluginDevSessionRecord {
  return {
    sessionId: 'dev_1',
    sourcePath,
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

describe('plugin-dev refresh', () => {
  beforeEach(() => {
    vi.useRealTimers();
    tempDirs = [];
    mocks.discoverAppCandidates.mockReset();
    mocks.classifyPluginDevConflicts.mockReset();
    mocks.validatePluginDevSourceManifest.mockReset();
    mocks.applyPluginDevServerResultToManifest.mockReset();
    mocks.ensurePluginDevServer.mockReset();
    mocks.stopPluginDevServer.mockReset();
    mocks.reconcileActiveDevSessionProjection.mockReset();
    mocks.clearAppManifestCache.mockReset();
    mocks.disposeAppSessionsForApp.mockReset();
    mocks.reloadAllSessionResources.mockReset();
    mocks.restartApp.mockReset();
    mocks.clearPluginBridgePolicyCache.mockReset();
    mocks.clearPackageCompatibilityCache.mockReset();
    mocks.invalidatePackageProviderManifestCache.mockReset();
    mocks.broadcastPluginEvent.mockReset();

    mocks.discoverAppCandidates.mockResolvedValue([]);
    mocks.classifyPluginDevConflicts.mockReturnValue([]);
    mocks.applyPluginDevServerResultToManifest.mockImplementation((manifest: SeroAppManifest) => manifest);
    mocks.stopPluginDevServer.mockResolvedValue();
    mocks.reconcileActiveDevSessionProjection.mockResolvedValue();
    mocks.reloadAllSessionResources.mockResolvedValue();
    mocks.restartApp.mockResolvedValue();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('keeps the last known good activation on soft refresh failure', async () => {
    const sourcePath = await createTempDir();
    mocks.validatePluginDevSourceManifest.mockRejectedValue(new Error('filesystem busy'));

    const result = await refreshPluginDevSession(createRecord(sourcePath), { reason: 'file-change' });

    expect(result.effect).toBe('none');
    expect(result.record).toEqual(expect.objectContaining({
      status: 'needs-attention',
      uiMode: 'dev-server',
      remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
      lastError: 'filesystem busy',
    }));
    expect(mocks.stopPluginDevServer).not.toHaveBeenCalled();
  });

  it('deactivates on persistent manifest invalidity after a retry', async () => {
    const sourcePath = await createTempDir();
    mocks.validatePluginDevSourceManifest.mockRejectedValue(
      new Error(`Local plugin folder has invalid package.json JSON: ${sourcePath}`),
    );

    const result = await refreshPluginDevSession(createRecord(sourcePath), { reason: 'file-change' });

    expect(mocks.validatePluginDevSourceManifest).toHaveBeenCalledTimes(2);
    expect(result.effect).toBe('deactivated');
    expect(result.record).toEqual(expect.objectContaining({
      status: 'broken',
      uiMode: 'unavailable',
      remoteEntryOverride: null,
      lastError: expect.stringContaining('invalid package.json JSON'),
    }));
    expect(result.event).toEqual({ type: 'uninstalled', pluginId: 'plugin-one' });
    expect(mocks.stopPluginDevServer).toHaveBeenCalledWith(sourcePath);
  });

  it('reconciles projection, invalidates caches, and restarts the targeted runtime', async () => {
    const manifest = createManifest('plugin-one', '/tmp/plugin-one');
    const event: PluginChangeEvent = { type: 'installed', manifest };

    await applyPluginDevSessionRefreshEffects({
      activeManifests: [manifest],
      appId: 'plugin-one',
      event,
    });

    expect(mocks.reconcileActiveDevSessionProjection).toHaveBeenCalledWith([manifest]);
    expect(mocks.clearAppManifestCache).toHaveBeenCalledOnce();
    expect(mocks.clearPluginBridgePolicyCache).toHaveBeenCalledOnce();
    expect(mocks.clearPackageCompatibilityCache).toHaveBeenCalledOnce();
    expect(mocks.invalidatePackageProviderManifestCache).toHaveBeenCalledOnce();
    expect(mocks.disposeAppSessionsForApp).toHaveBeenCalledWith('plugin-one');
    expect(mocks.reloadAllSessionResources).toHaveBeenCalledOnce();
    expect(mocks.restartApp).toHaveBeenCalledWith('plugin-one');
    expect(mocks.broadcastPluginEvent).toHaveBeenCalledWith(event);
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-dev-refresh-'));
  tempDirs.push(dir);
  return dir;
}
