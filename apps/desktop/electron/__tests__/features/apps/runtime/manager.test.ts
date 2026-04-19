import path from 'path';
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
    remoteEntryOverride: null,
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

function createHostStub(
  watch: (filePath: string) => void,
  unwatch: (filePath: string) => void,
) {
  return {
    appState: {
      read: vi.fn(async () => null),
      update: vi.fn(async () => {}),
      watch: (filePath: string) => watch(filePath),
      unwatch: (filePath: string) => unwatch(filePath),
    },
    subagents: {
      runStructured: vi.fn(async () => ({ response: '' })),
      onLiveOutput: vi.fn(() => () => {}),
    },
    workspace: {
      runCommand: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      refreshAfterSync: vi.fn(async () => ({ refreshed: false, dependenciesInstalled: false, restartedServerIds: [] })),
      resolveRuntime: vi.fn(async () => ({
        workspaceId: 'ws-1',
        workspacePath: '/repo-1',
        desiredRuntime: 'host' as const,
        actualRuntime: 'host' as const,
        containerEnabled: false,
        capabilityAudit: [],
      })),
    },
    verification: {
      detectCompileCommands: vi.fn(async () => []),
      detectDependencyInstallCommand: vi.fn(async () => null),
      detectDevServerCommand: vi.fn(async () => null),
      detectVerificationCommands: vi.fn(async () => []),
      runCommands: vi.fn(async () => ({ success: true, results: [] })),
      runDevServerSmokeCheck: vi.fn(async () => ({
        command: 'pnpm dev',
        success: true,
        stdout: '',
        stderr: '',
        durationMs: 0,
      })),
      summarizeFailure: vi.fn(() => 'failure'),
    },
    git: {
      createWorktree: vi.fn(async () => ({ worktreePath: '', branchName: '', greenfield: false })),
      removeWorktree: vi.fn(async () => {}),
      syncWorktreeWithDefaultBranch: vi.fn(async () => ({ success: true, updated: false, resolvedConflicts: false })),
      syncWorkspaceRootToDefaultBranch: vi.fn(async () => ({ synced: true })),
      createCheckpoint: vi.fn(async () => null),
      getDiffSummary: vi.fn(async () => ''),
      getDiff: vi.fn(async () => ''),
      pushBranch: vi.fn(async () => true),
      ensureRemoteDefaultBranch: vi.fn(async () => 'main'),
      createPr: vi.fn(async () => ({ success: true as const, url: '', number: 0 })),
      mergePr: vi.fn(async () => ({ success: true as const, state: 'merged' as const })),
      getPrMergeState: vi.fn(async () => 'unknown' as const),
      getPrMergeError: vi.fn(async () => null),
    },
    devServers: {
      startManaged: vi.fn(async () => ({ reason: 'not-used' })),
      list: vi.fn(() => []),
      stop: vi.fn(async () => false),
      restart: vi.fn(async () => false),
      unregister: vi.fn(() => false),
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
    const watch = vi.fn<(filePath: string) => void>();
    const unwatch = vi.fn<(filePath: string) => void>();
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
      createHost: () => createHostStub(watch, unwatch),
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

  it('isolates per-target startup failures during reconcile', async () => {
    const workspaces = [{ id: 'ws-1', path: '/repo-1' }];
    const manifests = [createManifest('broken'), createManifest('healthy')];
    const healthyRuntime = {
      start: vi.fn(async () => {}),
      handleStateChange: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = vi.fn<(filePath: string) => void>();
    const unwatch = vi.fn<(filePath: string) => void>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const manager = new AppRuntimeManager({
      discoverApps: async () => manifests,
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule: vi.fn(async (runtimeEntryPath: string): Promise<AppRuntimeModule> => {
        if (runtimeEntryPath.includes('/broken/')) {
          throw new Error('broken runtime');
        }
        return { createAppRuntime: async () => healthyRuntime };
      }),
      createHost: () => createHostStub(watch, unwatch),
    });

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(healthyRuntime.start).toHaveBeenCalledTimes(1);
    expect(watch).toHaveBeenCalledWith(path.join('/repo-1', '.sero/apps/healthy/state.json'));
    expect(errorSpy).toHaveBeenCalledWith(
      '[app-runtime] Failed to start runtime broken:ws-1 during reconcile:',
      expect.any(Error),
    );
  });

  it('retries initialization after a failed reconcile', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      handleStateChange: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = vi.fn<(filePath: string) => void>();
    const unwatch = vi.fn<(filePath: string) => void>();
    const workspaces = [{ id: 'ws-1', path: '/repo-1' }];
    let discoverCalls = 0;

    const manager = new AppRuntimeManager({
      discoverApps: async () => {
        discoverCalls += 1;
        if (discoverCalls === 1) {
          throw new Error('discovery failed');
        }
        return [createManifest('notes')];
      },
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule: async () => ({ createAppRuntime: async () => runtime }),
      createHost: () => createHostStub(watch, unwatch),
    });

    await expect(manager.initialize()).rejects.toThrow('discovery failed');
    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(discoverCalls).toBe(2);
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent reconciles so each runtime starts once', async () => {
    const moduleLoadReached = createDeferred<void>();
    const moduleLoadReleased = createDeferred<AppRuntimeModule>();
    const runtime = {
      start: vi.fn(async () => {}),
      handleStateChange: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = vi.fn<(filePath: string) => void>();
    const unwatch = vi.fn<(filePath: string) => void>();
    const manifests = [createManifest('notes')];
    const workspaces = [{ id: 'ws-1', path: '/repo-1' }];
    const loadRuntimeModule = vi.fn(async (): Promise<AppRuntimeModule> => {
      moduleLoadReached.resolve();
      return moduleLoadReleased.promise;
    });

    const manager = new AppRuntimeManager({
      discoverApps: async () => manifests,
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule,
      createHost: () => createHostStub(watch, unwatch),
    });

    const firstReconcile = manager.reconcile({ manifests, workspaces });
    await moduleLoadReached.promise;

    const secondReconcile = manager.reconcile({ manifests, workspaces });
    await Promise.resolve();

    expect(loadRuntimeModule).toHaveBeenCalledTimes(1);

    moduleLoadReleased.resolve({ createAppRuntime: async () => runtime });
    await Promise.all([firstReconcile, secondReconcile]);

    expect(loadRuntimeModule).toHaveBeenCalledTimes(1);
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });

  it('warns when a global runtime manifest is missing globalStatePath', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new AppRuntimeManager({
      discoverApps: async () => [createManifest('notes', {
        scope: 'global',
        globalStatePath: null,
      })],
      getOpenWorkspaces: async () => [{ id: 'global', path: '/global' }],
      loadRuntimeModule: async () => ({
        createAppRuntime: async () => ({ start() {}, handleStateChange() {}, dispose() {} }),
      }),
      createHost: () => createHostStub(vi.fn(), vi.fn()),
    });

    await manager.reconcile();

    expect(warnSpy).toHaveBeenCalledWith(
      '[app-runtime] Skipping global runtime notes: missing globalStatePath.',
    );
  });

  it('disposes stale runtimes during reconcile', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      handleStateChange: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const watch = vi.fn<(filePath: string) => void>();
    const unwatch = vi.fn<(filePath: string) => void>();
    const manifests = [createManifest('notes')];
    const workspaces = [{ id: 'ws-1', path: '/repo-1' }];

    const manager = new AppRuntimeManager({
      discoverApps: async () => manifests,
      getOpenWorkspaces: async () => workspaces,
      loadRuntimeModule: async () => ({ createAppRuntime: async () => runtime }),
      createHost: () => createHostStub(watch, unwatch),
    });

    await manager.initialize();
    await manager.reconcile({ manifests: [], workspaces });

    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(unwatch).toHaveBeenCalledWith(path.join('/repo-1', '.sero/apps/notes/state.json'));
  });
});
