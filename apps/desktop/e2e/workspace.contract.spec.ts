import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import type { WorkspaceRuntimeBackend } from '../src/types/workspace-runtime';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let parentDir: string;
let spacedParentDir: string;

const runtimeBackends: WorkspaceRuntimeBackend[] = ['host', 'apple-container', 'docker'];

async function removeWorkspaceIfPresent(workspaceId: string): Promise<void> {
  const exists = await page.evaluate(
    (id) => window.sero.workspace.list().then((workspaces) => workspaces.some((workspace) => workspace.id === id)),
    workspaceId,
  );
  if (!exists) return;
  await page.evaluate((id) => window.sero.workspace.remove(id), workspaceId);
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  parentDir = path.join(home.path, 'workspace-parents');
  spacedParentDir = path.join(home.path, 'workspace parents with space');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(spacedParentDir, { recursive: true });

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

test.describe('Workspace IPC contracts', () => {
  test('lists, creates, configures runtime, and removes a workspace', async () => {
    const before = await page.evaluate(() => window.sero.workspace.list());
    expect(Array.isArray(before)).toBe(true);

    const workspace = await page.evaluate(
      ({ name, parent }) => window.sero.workspace.create(name, parent),
      { name: 'Contract Workspace', parent: spacedParentDir },
    );

    try {
      expect(workspace).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: 'Contract Workspace',
        path: expect.stringContaining('workspace parents with space'),
        open: true,
        container: false,
      }));
      expect(workspace.runtime).toEqual(expect.objectContaining({ backend: 'host' }));
      expect(workspace.path).toBe(path.join(spacedParentDir, workspace.id));

      const listed = await page.evaluate((id) => window.sero.workspace.list()
        .then((workspaces) => workspaces.find((candidate) => candidate.id === id) ?? null), workspace.id);
      expect(listed).toEqual(expect.objectContaining({
        id: workspace.id,
        name: 'Contract Workspace',
        path: workspace.path,
        runtime: expect.objectContaining({ backend: 'host' }),
      }));

      const initialConfig = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), workspace.id);
      expect(initialConfig).toEqual(expect.objectContaining({ backend: 'host' }));

      await page.evaluate((id) => window.sero.workspace.setContainer(id, true), workspace.id);
      const containerConfig = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), workspace.id);
      expect(runtimeBackends).toContain(containerConfig.backend);

      await page.evaluate((id) => window.sero.workspace.setContainer(id, false), workspace.id);
      const hostConfig = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), workspace.id);
      expect(hostConfig).toEqual(expect.objectContaining({ backend: 'host' }));

      const dockerWorkspace = await page.evaluate(
        (id) => window.sero.workspace.setRuntimeBackend(id, 'docker'),
        workspace.id,
      );
      expect(runtimeBackends).toContain(dockerWorkspace.runtime.backend);

      const updated = await page.evaluate(
        (id) => window.sero.workspace.setRuntimeBackend(id, 'host'),
        workspace.id,
      );
      expect(updated).toEqual(expect.objectContaining({
        id: workspace.id,
        runtime: expect.objectContaining({ backend: 'host' }),
        container: false,
      }));

      const finalConfig = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), workspace.id);
      expect(finalConfig).toEqual(expect.objectContaining({ backend: 'host' }));
    } finally {
      await removeWorkspaceIfPresent(workspace.id);
    }

    const afterRemove = await page.evaluate((id) => window.sero.workspace.list()
      .then((workspaces) => workspaces.some((candidate) => candidate.id === id)), workspace.id);
    expect(afterRemove).toBe(false);
    expect(fs.existsSync(workspace.path)).toBe(true);
  });

  test('normalizes legacy mac-host runtime input to host on read', async () => {
    const workspace = await page.evaluate(
      ({ name, parent }) => window.sero.workspace.create(name, parent),
      { name: 'Legacy Runtime Contract', parent: parentDir },
    );

    try {
      const updated = await page.evaluate(
        (id) => window.sero.workspace.setRuntimeBackend(id, 'mac-host' as never),
        workspace.id,
      );
      expect(updated.runtime.backend).toBe('host');
      expect(updated.container).toBe(false);

      const config = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), workspace.id);
      expect(config).toEqual(expect.objectContaining({ backend: 'host' }));

      const listed = await page.evaluate((id) => window.sero.workspace.list()
        .then((workspaces) => workspaces.find((candidate) => candidate.id === id) ?? null), workspace.id);
      expect(listed?.runtime.backend).toBe('host');
    } finally {
      await removeWorkspaceIfPresent(workspace.id);
    }
  });
});
