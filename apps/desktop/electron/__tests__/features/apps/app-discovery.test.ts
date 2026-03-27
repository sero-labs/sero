import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalDevPlugins = process.env.SERO_DEV_PLUGINS;
const originalHomeOverride = process.env.SERO_HOME_OVERRIDE;
const builtinPluginPath = '/Users/test/dev/sero/plugins/sero-admin-plugin';

async function importAppDiscovery() {
  return import('../../../features/apps/discovery');
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

  it('suppresses devPort for installed plugins under ~/.sero-ui/agent/packages', async () => {
    process.env.SERO_DEV_PLUGINS = 'admin';

    const { getManifestDevPort, isInstalledPluginPackagePath } = await importAppDiscovery();
    const pluginPath = path.join('/tmp/fake-sero-home', 'agent', 'packages', 'admin');
    const actualPluginPath = path.join(process.env.HOME ?? '/Users/test', '.sero-ui', 'agent', 'packages', 'admin');

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
});
