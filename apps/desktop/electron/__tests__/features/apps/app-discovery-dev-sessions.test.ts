import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalHomeOverride = process.env.SERO_HOME_OVERRIDE;

async function importAppDiscovery() {
  return import('@electron/features/apps/discovery');
}

async function writeManifestPackage(
  packageDir: string,
  appId: string,
  name: string,
  appOverrides: Record<string, unknown> = {},
): Promise<void> {
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: `${appId}-plugin`,
      version: '1.0.0',
      sero: {
        app: {
          id: appId,
          name,
          icon: 'box',
          stateFile: `.sero/apps/${appId}/state.json`,
          ...appOverrides,
        },
        plugin: {
          category: 'utilities',
          tags: ['test'],
        },
      },
    }, null, 2),
  );
}

describe('app discovery local plugin dev sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalHomeOverride === undefined) {
      delete process.env.SERO_HOME_OVERRIDE;
    } else {
      process.env.SERO_HOME_OVERRIDE = originalHomeOverride;
    }
  });

  it('discovers active plugin dev session paths and overlays remoteEntryOverride', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-dev-session-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'dev-plugin');
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeManifestPackage(packageDir, 'dev-plugin', 'Dev Plugin', {
        component: 'DevPluginApp',
        ui: './dist/ui/remoteEntry.js',
        devPort: 5193,
      });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({
          sero: {
            pluginDev: {
              sessions: {
                dev_1: {
                  sessionId: 'dev_1',
                  sourcePath: packageDir,
                  expectedAppId: 'dev-plugin',
                  lastKnownName: 'Dev Plugin',
                  status: 'active',
                  uiMode: 'dev-server',
                  remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
                  lastError: null,
                  createdAt: '2026-04-19T20:00:00.000Z',
                  updatedAt: '2026-04-19T20:05:00.000Z',
                },
              },
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const manifest = (await discoverApps()).find((app) => app.id === 'dev-plugin');

      expect(manifest).toMatchObject({
        id: 'dev-plugin',
        packagePath: packageDir,
        devPort: 5193,
      });
      expect(manifest?.remoteEntryOverride).toBeTruthy();
      expect(new URL(manifest!.remoteEntryOverride!).origin + new URL(manifest!.remoteEntryOverride!).pathname).toBe(
        'http://127.0.0.1:5193/mf-manifest.json',
      );
      expect(new URL(manifest!.remoteEntryOverride!).searchParams.get('t')).toBe('2026-04-19T20:05:00.000Z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('overlays active dev-session remotes even when the source is projected through settings.packages', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-dev-session-packages-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'projected-dev-plugin');
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeManifestPackage(packageDir, 'projected-dev-plugin', 'Projected Dev Plugin', {
        component: 'ProjectedDevPluginApp',
        ui: './dist/ui/remoteEntry.js',
      });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({
          packages: [packageDir],
          sero: {
            pluginDev: {
              sessions: {
                dev_1: {
                  sessionId: 'dev_1',
                  sourcePath: packageDir,
                  expectedAppId: 'projected-dev-plugin',
                  lastKnownName: 'Projected Dev Plugin',
                  status: 'active',
                  uiMode: 'dev-server',
                  remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
                  lastError: null,
                  createdAt: '2026-04-19T20:00:00.000Z',
                  updatedAt: '2026-04-19T20:05:00.000Z',
                },
              },
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const manifest = (await discoverApps()).find((app) => app.id === 'projected-dev-plugin');

      expect(manifest).toMatchObject({
        id: 'projected-dev-plugin',
        packagePath: packageDir,
      });
      expect(manifest?.remoteEntryOverride).toBeTruthy();
      expect(new URL(manifest!.remoteEntryOverride!).origin + new URL(manifest!.remoteEntryOverride!).pathname).toBe(
        'http://127.0.0.1:5193/mf-manifest.json',
      );
      expect(new URL(manifest!.remoteEntryOverride!).searchParams.get('t')).toBe('2026-04-19T20:05:00.000Z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps built UI fallback sessions discoverable without surfacing legacy devPort remotes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-dev-session-fallback-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'fallback-dev-plugin');
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeManifestPackage(packageDir, 'fallback-dev-plugin', 'Fallback Dev Plugin', {
        component: 'FallbackDevPluginApp',
        ui: './dist/ui/remoteEntry.js',
        devPort: 5193,
      });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({
          packages: [packageDir],
          sero: {
            pluginDev: {
              sessions: {
                dev_1: {
                  sessionId: 'dev_1',
                  sourcePath: packageDir,
                  expectedAppId: 'fallback-dev-plugin',
                  lastKnownName: 'Fallback Dev Plugin',
                  status: 'needs-attention',
                  uiMode: 'built-fallback',
                  remoteEntryOverride: null,
                  lastError: 'Dev server start failed.',
                  createdAt: '2026-04-19T20:00:00.000Z',
                  updatedAt: '2026-04-19T20:05:00.000Z',
                },
              },
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const manifest = (await discoverApps()).find((app) => app.id === 'fallback-dev-plugin');

      expect(manifest).toMatchObject({
        id: 'fallback-dev-plugin',
        packagePath: packageDir,
        component: 'FallbackDevPluginApp',
        uiEntry: expect.stringContaining('/dist/ui/remoteEntry.js'),
        devPort: undefined,
        remoteEntryOverride: null,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('suppresses UI surfaces for active dev sessions whose UI mode is unavailable', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-dev-session-unavailable-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'unavailable-dev-plugin');
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeManifestPackage(packageDir, 'unavailable-dev-plugin', 'Unavailable Dev Plugin', {
        component: 'UnavailableDevPluginApp',
        ui: './dist/ui/remoteEntry.js',
      });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({
          packages: [packageDir],
          sero: {
            pluginDev: {
              sessions: {
                dev_1: {
                  sessionId: 'dev_1',
                  sourcePath: packageDir,
                  expectedAppId: 'unavailable-dev-plugin',
                  lastKnownName: 'Unavailable Dev Plugin',
                  status: 'needs-attention',
                  uiMode: 'unavailable',
                  remoteEntryOverride: null,
                  lastError: 'Dev server start failed.',
                  createdAt: '2026-04-19T20:00:00.000Z',
                  updatedAt: '2026-04-19T20:05:00.000Z',
                },
              },
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const manifest = (await discoverApps()).find((app) => app.id === 'unavailable-dev-plugin');

      expect(manifest).toMatchObject({
        id: 'unavailable-dev-plugin',
        packagePath: packageDir,
        component: null,
        uiEntry: null,
        devPort: undefined,
        remoteEntryOverride: null,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
