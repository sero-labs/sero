import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('plugin manager discovery registration', () => {
  let tempRoot: string | null = null;

  async function createPluginSource(pluginId: string): Promise<string> {
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
          plugin: {
            category: 'utilities',
            tags: ['test'],
          },
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

  it('removes uninstalled plugins from discovery state without requiring a restart', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-plugin-manager-'));
    const sourceDir = await createPluginSource('todo');
    const { installPlugin, uninstallPlugin, discoverApps, agentDir } = await importModules();

    const manifest = await installPlugin(sourceDir);
    const installPath = path.join(agentDir, 'packages', 'todo');

    expect(manifest.id).toBe('todo');
    expect(manifest.packagePath).toBe(installPath);
    expect((await discoverApps()).some((app) => app.id === 'todo')).toBe(true);

    await uninstallPlugin('todo');

    expect((await discoverApps()).some((app) => app.id === 'todo')).toBe(false);
    await expect(fs.stat(installPath)).rejects.toThrow();
    await expect(fs.readFile(path.join(agentDir, 'settings.json'), 'utf8')).resolves.toContain('"packages": []');
  });
});
