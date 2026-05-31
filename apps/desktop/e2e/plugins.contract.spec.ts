import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import type { SeroAppManifest } from '../src/types/ipc';

const builtinPlugins = ['admin', 'cron', 'git', 'mcp', 'memory', 'user-feedback', 'web'];
const uiBuiltins = ['admin', 'cron', 'git', 'mcp', 'userfeedback', 'web'];
const fixturePath = path.resolve(__dirname, 'fixtures/test-plugin');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
});

test.afterAll(async () => {
  await closeSeroApp(app);
  home.cleanup();
});

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function readSettingsPackages(): string[] {
  const raw = fs.readFileSync(path.join(home.path, 'agent', 'settings.json'), 'utf8');
  const settings = JSON.parse(raw) as { packages?: Array<string | { source?: string }> };
  return (settings.packages ?? [])
    .map((entry) => typeof entry === 'string' ? entry : entry.source ?? '')
    .map(normalizeFsPath);
}

async function addWorkspace() {
  const parent = path.join(home.path, 'plugin-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  return page.evaluate(
    ({ name, parentPath }) => window.sero.workspace.create(name, parentPath),
    { name: 'Plugin Contract Workspace', parentPath: parent },
  );
}

test.describe('Plugin manager and discovery contracts', () => {
  test('registers built-in plugin package paths in settings', () => {
    const packages = readSettingsPackages();
    for (const plugin of builtinPlugins) {
      expect(packages.some((entry) => entry.endsWith(`plugins/sero-${plugin}-plugin`))).toBe(true);
    }
  });

  test('discovers UI app manifests without extension-only plugins', async () => {
    const apps = await page.evaluate(() => window.sero.apps.discover()) as SeroAppManifest[];
    const byId = new Map<string, SeroAppManifest>(apps.map((manifest) => [manifest.id, manifest]));

    for (const id of uiBuiltins) {
      const manifest = byId.get(id);
      expect(manifest).toEqual(expect.objectContaining({
        id,
        name: expect.any(String),
        scope: expect.any(String),
        stateFile: expect.any(String),
        isPlugin: true,
        component: expect.any(String),
        plugin: expect.objectContaining({
          category: expect.any(String),
          tags: expect.any(Array),
        }),
      }));
      expect(normalizeFsPath(manifest!.packagePath)).toContain('/plugins/');
    }

    expect(byId.has('memory')).toBe(false);
  });

  test('keeps built-ins out of installed plugin manager list', async () => {
    const result = await page.evaluate(async () => ({
      installed: await window.sero.plugins.list(),
      mcp: await window.sero.plugins.isPlugin('mcp'),
      admin: await window.sero.plugins.isPlugin('admin'),
    }));

    expect(result.installed).toEqual([]);
    expect(result.mcp).toBe(false);
    expect(result.admin).toBe(false);
  });

  test('installs, invokes, persists, and uninstalls a synthetic local plugin', async () => {
    const events = await page.evaluate((sourcePath) => new Promise<unknown[]>(async (resolve, reject) => {
      const seen: unknown[] = [];
      const unsubscribe = window.sero.plugins.onChanged((event) => seen.push(event));
      try {
        const manifest = await window.sero.plugins.install(sourcePath);
        if (manifest.id !== 'e2e-test-plugin') throw new Error(`unexpected id ${manifest.id}`);
        const listed = await window.sero.plugins.list();
        const installed = await window.sero.plugins.isPlugin('e2e-test-plugin');
        const discovered = await window.sero.apps.discover();
        if (!listed.some((plugin) => plugin.id === 'e2e-test-plugin')) throw new Error('plugin missing from list');
        if (!installed) throw new Error('plugin isPlugin false');
        if (!discovered.some((app: SeroAppManifest) => app.id === 'e2e-test-plugin')) throw new Error('plugin missing from discovery');
        unsubscribe();
        resolve(seen);
      } catch (error) {
        unsubscribe();
        reject(error);
      }
    }), fixturePath);

    expect(events.length).toBeGreaterThan(0);

    const workspace = await addWorkspace();
    const write = await page.evaluate(
      (workspaceId) => window.sero.appAgent.invokeTool(
        'e2e-test-plugin',
        workspaceId,
        'e2e_test_plugin',
        { action: 'write', value: 'phase-3' },
      ),
      workspace.id,
    );
    expect(write.text).toContain('wrote: phase-3');

    const statePath = path.join(home.path, 'apps', 'e2e-test-plugin', 'state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual({ value: 'phase-3', writes: 1 });

    const read = await page.evaluate(
      (workspaceId) => window.sero.appAgent.invokeTool(
        'e2e-test-plugin',
        workspaceId,
        'e2e_test_plugin',
        { action: 'read' },
      ),
      workspace.id,
    );
    expect(read.text).toContain('phase-3');

    await page.evaluate(() => window.sero.plugins.uninstall('e2e-test-plugin'));
    const after = await page.evaluate(async () => ({
      listed: await window.sero.plugins.list(),
      discovered: await window.sero.apps.discover(),
    }));
    expect(after.listed.some((plugin) => plugin.id === 'e2e-test-plugin')).toBe(false);
    expect(after.discovered.some((manifest: SeroAppManifest) => manifest.id === 'e2e-test-plugin')).toBe(false);
    expect(fs.existsSync(statePath)).toBe(true);
  });

  test('starts, refreshes, lists, and stops a local plugin dev session', async () => {
    const started = await page.evaluate((sourcePath) => window.sero.plugins.startDevSession(sourcePath), fixturePath);
    if (!started) throw new Error('Expected dev session to start');
    expect(started).toEqual(expect.objectContaining({
      appId: 'e2e-test-plugin',
      sourcePath: fixturePath,
      status: 'active',
      uiMode: 'backend-only',
    }));

    const listed = await page.evaluate(() => window.sero.plugins.listDevSessions());
    expect(listed.some((session) => session.appId === 'e2e-test-plugin')).toBe(true);

    const refreshed = await page.evaluate((sessionId) => window.sero.plugins.refreshDevSession(sessionId), started.sessionId);
    expect(refreshed).toEqual(expect.objectContaining({ appId: 'e2e-test-plugin', status: 'active' }));

    await page.evaluate((sessionId) => window.sero.plugins.stopDevSession(sessionId), started.sessionId);
    const stopped = await page.evaluate(() => window.sero.plugins.listDevSessions());
    expect(stopped.some((session) => session.appId === 'e2e-test-plugin')).toBe(false);
  });
});
