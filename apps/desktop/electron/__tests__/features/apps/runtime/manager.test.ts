import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import {
  AppRuntimeManager,
} from '@electron/features/apps/runtime/manager';
import type {
  AppRuntimeContext,
  AppRuntimeModule,
} from '@electron/features/apps/runtime/types';

function createManifest(
  id: string,
  overrides: Partial<SeroAppManifest> = {},
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
    runtimeEntry: `/tmp/${id}/runtime/index.js`,
    component: null,
    devPort: undefined,
    packagePath: `/tmp/${id}`,
    isPlugin: true,
    plugin: {
      category: 'utilities',
      tags: [id],
      requiredHostCapabilities: ['appRuntime.background'],
    },
    hostCompatibility: {
      supported: true,
      hostVersion: '0.1.0',
      issues: [],
    },
    widgets: [],
    ...overrides,
  };
}

describe('AppRuntimeManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts one runtime per eligible workspace and routes matching state changes', async () => {
    const workspaces = [
      { id: 'global', path: '/global' },
      { id: 'ws-1', path: '/repo-1' },
      { id: 'ws-2', path: '/repo-2' },
    ];
    const manifests = [
      createManifest('notes'),
      createManifest('unsupported', {
        runtimeEntry: '/tmp/unsupported/runtime/index.js',
        hostCompatibility: {
          supported: false,
          hostVersion: '0.1.0',
          issues: [{ kind: 'requiredHostCapability', message: 'missing', capability: 'future.cap' }],
        },
      }),
    ];

    const createdRuntimes: Array<{
      ctx: AppRuntimeContext;
      runtime: {
        start: ReturnType<typeof vi.fn>;
        handleStateChange: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      };
    }> = [];
    const watch = vi.fn();
    const unwatch = vi.fn();
    const loadRuntimeModule = vi.fn(async (): Promise<AppRuntimeModule> => ({
      createAppRuntime: async (ctx) => {
        const runtime = {
          start: vi.fn(async () => {}),
          handleStateChange: vi.fn(async () => {}),
          dispose: vi.fn(async () => {}),
        };
        createdRuntimes.push({ ctx, runtime });
        return runtime;
      },
    }));

    const manager = new AppRuntimeManager({
      discoverApps: async () => manifests,
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule,
      createHost: () => ({
        appState: {
          read: vi.fn(async () => null),
          update: vi.fn(async () => {}),
          watch,
          unwatch,
        },
      }),
    });

    await manager.initialize();
    const repoOneStatePath = path.join('/repo-1', '.sero/apps/notes/state.json');
    const repoTwoStatePath = path.join('/repo-2', '.sero/apps/notes/state.json');

    expect(loadRuntimeModule).toHaveBeenCalledTimes(2);
    expect(watch).toHaveBeenCalledWith(repoOneStatePath);
    expect(watch).toHaveBeenCalledWith(repoTwoStatePath);
    expect(createdRuntimes).toHaveLength(2);
    expect(createdRuntimes.map((entry) => entry.ctx.workspaceId)).toEqual(['ws-1', 'ws-2']);
    expect(createdRuntimes.every((entry) => entry.runtime.start.mock.calls.length === 1)).toBe(true);

    await manager.handleStateChange(repoOneStatePath, { ok: true });

    expect(createdRuntimes[0]?.runtime.handleStateChange).toHaveBeenCalledWith({ ok: true });
    expect(createdRuntimes[1]?.runtime.handleStateChange).not.toHaveBeenCalled();
  });

  it('disposes stale runtimes during reconcile', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      handleStateChange: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = vi.fn();
    const unwatch = vi.fn();
    const manifests = [createManifest('notes')];
    const workspaces = [{ id: 'ws-1', path: '/repo-1' }];

    const manager = new AppRuntimeManager({
      discoverApps: async () => manifests,
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule: async () => ({ createAppRuntime: async () => runtime }),
      createHost: () => ({
        appState: {
          read: vi.fn(async () => null),
          update: vi.fn(async () => {}),
          watch,
          unwatch,
        },
      }),
    });

    await manager.initialize();
    await manager.reconcile({ manifests: [], workspaces });

    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(unwatch).toHaveBeenCalledWith(path.join('/repo-1', '.sero/apps/notes/state.json'));
  });
});
