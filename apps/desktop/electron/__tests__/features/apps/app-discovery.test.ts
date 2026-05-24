import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalDevPlugins = process.env.SERO_DEV_PLUGINS;
const originalHomeOverride = process.env.SERO_HOME_OVERRIDE;
const builtinPluginPath = '/Users/test/dev/sero/plugins/sero-admin-plugin';

async function importAppDiscovery() {
  return import('@electron/features/apps/discovery');
}

async function writeManifestPackage(
  packageDir: string,
  appId: string,
  name = 'Admin',
  plugin: unknown = {
    category: 'utilities',
    tags: ['test'],
  },
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
        plugin,
      },
    }, null, 2),
  );
}

describe('app discovery devPort handling', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    delete process.env.SERO_DEV_PLUGINS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalDevPlugins === undefined) {
      delete process.env.SERO_DEV_PLUGINS;
    } else {
      process.env.SERO_DEV_PLUGINS = originalDevPlugins;
    }
    if (originalHomeOverride === undefined) {
      delete process.env.SERO_HOME_OVERRIDE;
    } else {
      process.env.SERO_HOME_OVERRIDE = originalHomeOverride;
    }
  });

  it('omits devPort by default for built-in plugins during development', async () => {
    const { getManifestDevPort } = await importAppDiscovery();

    expect(getManifestDevPort('admin', builtinPluginPath, 5193)).toBeUndefined();
  });

  it('keeps devPort for plugins listed in SERO_DEV_PLUGINS', async () => {
    process.env.SERO_DEV_PLUGINS = 'admin';

    const { getManifestDevPort } = await importAppDiscovery();

    expect(getManifestDevPort('admin', builtinPluginPath, 5193)).toBe(5193);
  });

  it('suppresses devPort for installed plugins under ~/.sero-ui/agent/plugins', async () => {
    process.env.SERO_DEV_PLUGINS = 'admin';

    const { getManifestDevPort, isInstalledPluginPackagePath } = await importAppDiscovery();
    const pluginPath = path.join('/tmp/fake-sero-home', 'agent', 'plugins', 'admin');
    const actualPluginPath = path.join(process.env.HOME ?? '/Users/test', '.sero-ui', 'agent', 'plugins', 'admin');

    expect(isInstalledPluginPackagePath(pluginPath)).toBe(false);
    expect(isInstalledPluginPackagePath(actualPluginPath)).toBe(true);
    expect(getManifestDevPort('admin', actualPluginPath, 5193)).toBeUndefined();
  });

  it('discovers devPort from agent packages without requiring a listening dev server', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;
    process.env.SERO_DEV_PLUGINS = 'admin';

    try {
      const packageDir = path.join(tempRoot, 'apps', 'admin');
      await mkdir(packageDir, { recursive: true });
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({ packages: [{ source: packageDir }] }, null, 2),
      );
      await writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify({
          name: 'admin',
          version: '1.0.0',
          sero: {
            app: {
              id: 'admin',
              name: 'Admin',
              icon: 'shield',
              stateFile: '.sero/apps/admin/state.json',
              component: 'AdminApp',
              devPort: 5193,
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const apps = await discoverApps();
      const admin = apps.find((app) => app.id === 'admin');

      expect(admin?.devPort).toBe(5193);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('stops discovering manually registered paths once they are unregistered', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-registered-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'external-plugin');
      await writeManifestPackage(packageDir, 'external-plugin', 'External Plugin');

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      expect((await discoverApps()).some((app) => app.id === 'external-plugin')).toBe(true);

      unregisterAppPath(packageDir);
      expect((await discoverApps()).some((app) => app.id === 'external-plugin')).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves valid plugin metadata during discovery', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-plugin-valid-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'valid-plugin');
      await writeManifestPackage(packageDir, 'valid-plugin', 'Valid Plugin', {
        category: 'utilities',
        tags: ['test', ' utilities '],
        minSeroVersion: '0.1.0',
        requiredHostCapabilities: [' appAgent.invokeTool ', 'tool.cli', ' appRuntime.background '],
        preBuilt: false,
        bridgeTools: [' tool_a ', 'tool_b'],
      }, {
        runtime: './runtime/index.ts',
        runtimeExternals: [' better-sqlite3 ', 'keytar', 'better-sqlite3'],
      });

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      const manifest = (await discoverApps()).find((app) => app.id === 'valid-plugin');

      expect(manifest).toMatchObject({
        id: 'valid-plugin',
        isPlugin: true,
        plugin: {
          category: 'utilities',
          tags: ['test', 'utilities'],
          minSeroVersion: '0.1.0',
          requiredHostCapabilities: ['appAgent.invokeTool', 'tool.cli', 'appRuntime.background'],
          preBuilt: false,
          bridgeTools: ['tool_a', 'tool_b'],
        },
        runtimeEntry: path.join(packageDir, 'runtime', 'index.ts'),
        runtimeExternals: ['better-sqlite3', 'keytar'],
        hostCompatibility: {
          supported: true,
          hostVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
          issues: [],
        },
      });

      unregisterAppPath(packageDir);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps malformed plugin manifests classified as plugins while dropping invalid metadata', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-plugin-invalid-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const packageDir = path.join(tempRoot, 'invalid-plugin');
      await writeManifestPackage(packageDir, 'invalid-plugin', 'Invalid Plugin', {
        category: 'not-a-real-category',
        tags: ['test'],
      });

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      const manifest = (await discoverApps()).find((app) => app.id === 'invalid-plugin');

      expect(manifest).toMatchObject({
        id: 'invalid-plugin',
        isPlugin: true,
        plugin: null,
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring invalid sero.plugin metadata'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`sero.plugin.category` must be one of'));

      unregisterAppPath(packageDir);
    } finally {
      warnSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('still enforces compatibility requirements when unrelated plugin metadata is malformed', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-plugin-invalid-compat-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const packageDir = path.join(tempRoot, 'invalid-compatible-plugin');
      await writeManifestPackage(packageDir, 'invalid-compatible-plugin', 'Invalid Compatible Plugin', {
        category: 'not-a-real-category',
        tags: ['test'],
        minSeroVersion: '9.9.9',
      });

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      const manifest = (await discoverApps()).find((app) => app.id === 'invalid-compatible-plugin');

      expect(manifest).toMatchObject({
        id: 'invalid-compatible-plugin',
        isPlugin: true,
        plugin: null,
      });
      expect(manifest?.hostCompatibility?.supported).toBe(false);
      expect(manifest?.hostCompatibility?.issues[0]?.kind).toBe('minSeroVersion');

      unregisterAppPath(packageDir);
    } finally {
      warnSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('marks plugins unsupported when their host requirements are not satisfied', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-plugin-compat-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'incompatible-plugin');
      await writeManifestPackage(packageDir, 'incompatible-plugin', 'Incompatible Plugin', {
        category: 'utilities',
        tags: ['test'],
        minSeroVersion: '9.9.9',
      });

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      const manifest = (await discoverApps()).find((app) => app.id === 'incompatible-plugin');

      expect(manifest?.hostCompatibility?.supported).toBe(false);
      expect(manifest?.hostCompatibility?.issues[0]?.kind).toBe('minSeroVersion');
      expect(manifest?.hostCompatibility?.issues[0]?.message).toContain('Requires Sero 9.9.9 or newer');

      unregisterAppPath(packageDir);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('warns when sero.plugin is malformed but still keeps plugin classification', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-plugin-non-object-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const packageDir = path.join(tempRoot, 'non-object-plugin');
      await writeManifestPackage(packageDir, 'non-object-plugin', 'Non Object Plugin', 'bad-plugin-meta');

      const { discoverApps, registerAppPath, unregisterAppPath } = await importAppDiscovery();

      registerAppPath(packageDir);
      const manifest = (await discoverApps()).find((app) => app.id === 'non-object-plugin');

      expect(manifest).toMatchObject({
        id: 'non-object-plugin',
        isPlugin: true,
        plugin: null,
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`sero.plugin` must be an object'));

      unregisterAppPath(packageDir);
    } finally {
      warnSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

});
