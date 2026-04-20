import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('plugin manager discovery registration', () => {
  let tempRoot: string | null = null;

  async function createPluginSource(
    pluginId: string,
    pluginMeta: Record<string, unknown> = {
      category: 'utilities',
      tags: ['test'],
    },
  ): Promise<string> {
    if (!tempRoot) {
      throw new Error('tempRoot not initialized');
    }

    const sourceDir = path.join(tempRoot, 'sources', pluginId);
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: `${pluginId}-plugin`,
        version: '1.0.0',
        description: 'Test plugin',
        sero: {
          app: {
            id: pluginId,
            name: 'Test Plugin',
            icon: 'box',
            stateFile: `.sero/apps/${pluginId}/state.json`,
          },
          plugin: pluginMeta,
        },
      }, null, 2),
      'utf8',
    );

    return sourceDir;
  }

  async function importModules() {
    if (!tempRoot) {
      throw new Error('tempRoot not initialized');
    }

    vi.resetModules();

    const agentDir = path.join(tempRoot, 'agent');
    vi.doMock('@electron/platform/env', () => ({
      SERO_HOME: tempRoot,
      SERO_AGENT_DIR: agentDir,
      SERO_FIXED_ROOT: path.join(tempRoot!, 'fixed-root'),
    }));
    vi.doMock('@electron/platform/protocols/ext-protocol', () => ({
      registerExtAssets: vi.fn(),
      unregisterExtAssets: vi.fn(),
    }));
    vi.doMock('@electron/shared/providers/package-provider-manifests', () => ({
      invalidatePackageProviderManifestCache: vi.fn(),
    }));
    vi.doMock('@electron/ipc/agent/handlers/app-agent', () => ({
      clearAppManifestCache: vi.fn(),
    }));
    vi.doMock('@electron/cli', () => ({
      clearPluginBridgePolicyCache: vi.fn(),
    }));

    const manager = await import('@electron/features/plugins/manager');
    const discovery = await import('@electron/features/apps/discovery');

    return {
      ...manager,
      ...discovery,
      agentDir,
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock('@electron/platform/env');
    vi.unmock('@electron/platform/protocols/ext-protocol');
    vi.unmock('@electron/shared/providers/package-provider-manifests');
    vi.unmock('@electron/ipc/agent/handlers/app-agent');
    vi.unmock('@electron/cli');

    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('blocks plugin installs when the host compatibility contract is not satisfied', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-compat-'));
    const sourceDir = await createPluginSource('future-plugin', {
      category: 'utilities',
      tags: ['test'],
      minSeroVersion: '9.9.9',
    });
    const { installPlugin, agentDir } = await importModules();

    await expect(installPlugin(sourceDir)).rejects.toThrow('Requires Sero 9.9.9 or newer');
    await expect(fs.stat(path.join(agentDir, 'plugins', 'future-plugin'))).rejects.toThrow();
  });

  it('still blocks installs when compatibility requirements are present alongside invalid plugin metadata', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-invalid-compat-'));
    const sourceDir = await createPluginSource('invalid-future-plugin', {
      category: 'not-a-real-category',
      tags: ['test'],
      minSeroVersion: '9.9.9',
    });
    const { installPlugin, agentDir } = await importModules();

    await expect(installPlugin(sourceDir)).rejects.toThrow('Requires Sero 9.9.9 or newer');
    await expect(fs.stat(path.join(agentDir, 'plugins', 'invalid-future-plugin'))).rejects.toThrow();
  });

  it('blocks installs when an active local plugin development session already owns the app id', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-dev-session-'));
    const sourceDir = await createPluginSource('todo');
    const { installPlugin, agentDir } = await importModules();

    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({
        sero: {
          pluginDev: {
            sessions: {
              dev_1: {
                sessionId: 'dev_1',
                sourcePath: sourceDir,
                expectedAppId: 'todo',
                lastKnownName: 'Todo Dev',
                status: 'active',
                uiMode: 'backend-only',
                remoteEntryOverride: null,
                lastError: null,
                createdAt: '2026-04-19T20:00:00.000Z',
                updatedAt: '2026-04-19T20:05:00.000Z',
              },
            },
          },
        },
      }, null, 2),
      'utf8',
    );

    await expect(installPlugin(sourceDir)).rejects.toThrow(
      /already owned by active local plugin development session dev_1/,
    );
    await expect(fs.stat(path.join(agentDir, 'plugins', 'todo'))).rejects.toThrow();
  });

  it('reconciles installed plugin activation so unsupported plugins stay on disk but out of settings', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-reconcile-'));
    const { reconcileInstalledPluginActivation, agentDir } = await importModules();

    const compatiblePath = path.join(agentDir, 'plugins', 'compatible-plugin');
    const incompatiblePath = path.join(agentDir, 'plugins', 'incompatible-plugin');
    await fs.mkdir(compatiblePath, { recursive: true });
    await fs.mkdir(incompatiblePath, { recursive: true });

    await fs.writeFile(
      path.join(compatiblePath, 'package.json'),
      JSON.stringify({
        name: 'compatible-plugin',
        version: '1.0.0',
        sero: {
          app: {
            id: 'compatible-plugin',
            name: 'Compatible Plugin',
            icon: 'box',
            stateFile: '.sero/apps/compatible-plugin/state.json',
          },
          plugin: {
            category: 'utilities',
            tags: ['test'],
          },
        },
      }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(incompatiblePath, 'package.json'),
      JSON.stringify({
        name: 'incompatible-plugin',
        version: '1.0.0',
        sero: {
          app: {
            id: 'incompatible-plugin',
            name: 'Incompatible Plugin',
            icon: 'box',
            stateFile: '.sero/apps/incompatible-plugin/state.json',
          },
          plugin: {
            category: 'utilities',
            tags: ['test'],
            minSeroVersion: '9.9.9',
          },
        },
      }, null, 2),
      'utf8',
    );

    await fs.writeFile(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({
        packages: [incompatiblePath],
      }, null, 2),
      'utf8',
    );

    await reconcileInstalledPluginActivation();

    const settings = await fs.readFile(path.join(agentDir, 'settings.json'), 'utf8');
    expect(settings).toContain(compatiblePath);
    expect(settings).not.toContain(incompatiblePath);
    await expect(fs.stat(incompatiblePath)).resolves.toBeDefined();
  });

  it('preserves existing package order while removing incompatible managed plugins', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-order-'));
    const { reconcileInstalledPluginActivation, agentDir } = await importModules();

    const zPluginPath = path.join(agentDir, 'plugins', 'z-plugin');
    const aPluginPath = path.join(agentDir, 'plugins', 'a-plugin');
    const customPackagePath = path.join(tempRoot, 'custom-package');
    await fs.mkdir(zPluginPath, { recursive: true });
    await fs.mkdir(aPluginPath, { recursive: true });

    await fs.writeFile(
      path.join(zPluginPath, 'package.json'),
      JSON.stringify({
        name: 'z-plugin',
        version: '1.0.0',
        sero: {
          app: {
            id: 'z-plugin',
            name: 'Z Plugin',
            icon: 'box',
            stateFile: '.sero/apps/z-plugin/state.json',
          },
          plugin: {
            category: 'utilities',
            tags: ['test'],
          },
        },
      }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(aPluginPath, 'package.json'),
      JSON.stringify({
        name: 'a-plugin',
        version: '1.0.0',
        sero: {
          app: {
            id: 'a-plugin',
            name: 'A Plugin',
            icon: 'box',
            stateFile: '.sero/apps/a-plugin/state.json',
          },
          plugin: {
            category: 'utilities',
            tags: ['test'],
          },
        },
      }, null, 2),
      'utf8',
    );

    await fs.writeFile(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({
        packages: [customPackagePath, zPluginPath, aPluginPath],
      }, null, 2),
      'utf8',
    );

    await reconcileInstalledPluginActivation();

    const settings = JSON.parse(await fs.readFile(path.join(agentDir, 'settings.json'), 'utf8')) as {
      packages: string[];
    };
    expect(settings.packages).toEqual([customPackagePath, zPluginPath, aPluginPath]);
  });

  it('removes incompatible local-path plugin packages from the active settings list', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-local-path-'));
    const sourceDir = await createPluginSource('manual-local-plugin', {
      category: 'utilities',
      tags: ['test'],
      minSeroVersion: '9.9.9',
    });
    const { reconcileInstalledPluginActivation, agentDir } = await importModules();

    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({
        packages: [sourceDir],
      }, null, 2),
      'utf8',
    );

    await reconcileInstalledPluginActivation();

    const settings = await fs.readFile(path.join(agentDir, 'settings.json'), 'utf8');
    expect(settings).not.toContain(sourceDir);
  });

  it('removes uninstalled plugins from discovery state without requiring a restart', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-'));
    const sourceDir = await createPluginSource('todo');
    const { installPlugin, uninstallPlugin, discoverApps, agentDir } = await importModules();

    const manifest = await installPlugin(sourceDir);
    const installPath = path.join(agentDir, 'plugins', 'todo');

    expect(manifest.id).toBe('todo');
    expect(manifest.packagePath).toBe(installPath);
    expect((await discoverApps()).some((app) => app.id === 'todo')).toBe(true);

    await uninstallPlugin('todo');

    expect((await discoverApps()).some((app) => app.id === 'todo')).toBe(false);
    await expect(fs.stat(installPath)).rejects.toThrow();
    await expect(fs.readFile(path.join(agentDir, 'settings.json'), 'utf8')).resolves.toContain('"packages": []');
  });
});
