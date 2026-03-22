import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalDevApps = process.env.SERO_DEV_APPS;

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
});
