import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalDevApps = process.env.SERO_DEV_APPS;
const originalHomeOverride = process.env.SERO_HOME_OVERRIDE;

async function importAppDiscovery() {
  return import('../app-discovery');
}

describe('app discovery devPort handling', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.SERO_DEV_APPS = 'all';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SERO_DEV_APPS = originalDevApps;
    if (originalHomeOverride === undefined) {
      delete process.env.SERO_HOME_OVERRIDE;
    } else {
      process.env.SERO_HOME_OVERRIDE = originalHomeOverride;
    }
  });

  it('suppresses devPort for installed plugins under ~/.sero-ui/agent/packages', async () => {
    const { getManifestDevPort, isInstalledPluginPackagePath } = await importAppDiscovery();
    const pluginPath = path.join('/tmp/fake-sero-home', 'agent', 'packages', 'todo');

    expect(isInstalledPluginPackagePath(pluginPath)).toBe(false);

    const actualPluginPath = path.join(process.env.HOME ?? '/Users/test', '.sero-ui', 'agent', 'packages', 'todo');
    expect(isInstalledPluginPackagePath(actualPluginPath)).toBe(true);
    expect(getManifestDevPort('todo', actualPluginPath, 5174)).toBeUndefined();
  });

  it('keeps devPort for built-in monorepo packages during development', async () => {
    const { getManifestDevPort } = await importAppDiscovery();
    const builtinPath = '/Users/test/dev/sero/packages/pi-todo-extension';

    expect(getManifestDevPort('todo', builtinPath, 5174)).toBe(5174);
  });

  it('discovers devPort from agent packages without requiring a listening dev server', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-app-discovery-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;

    try {
      const packageDir = path.join(tempRoot, 'apps', 'todo');
      await mkdir(packageDir, { recursive: true });
      await mkdir(path.join(tempRoot, 'agent'), { recursive: true });
      await writeFile(
        path.join(tempRoot, 'agent', 'settings.json'),
        JSON.stringify({ packages: [{ source: packageDir }] }, null, 2),
      );
      await writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify({
          name: 'todo',
          version: '1.0.0',
          sero: {
            app: {
              id: 'todo',
              name: 'Todo',
              icon: 'check-square',
              stateFile: '.sero/apps/todo/state.json',
              component: 'TodoApp',
              devPort: 5174,
            },
          },
        }, null, 2),
      );

      const { discoverApps } = await importAppDiscovery();
      const apps = await discoverApps();
      const todo = apps.find((app) => app.id === 'todo');

      expect(todo?.devPort).toBe(5174);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
