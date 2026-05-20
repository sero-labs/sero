import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  openExplorer,
  runtimeSkipReason,
  waitForShell,
  workspace,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

async function addWorkspace(folderPath: string, name: string) {
  return page.evaluate(async ({ folderPath, name }) => {
    const ws = await window.sero.workspace.addFolder(folderPath, name);
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return ws;
  }, { folderPath, name });
}

test('adds, switches, closes, and re-adds workspaces in the sidebar', async () => {
  const alphaDir = createWorkspaceDir(home.path, 'alpha workspace', { 'README.md': '# alpha\n' });
  const betaDir = createWorkspaceDir(home.path, 'beta workspace', { 'README.md': '# beta\n' });

  const alpha = await addWorkspace(alphaDir, 'Alpha Workspace');
  const beta = await addWorkspace(betaDir, 'Beta Workspace');
  await openExplorer(page);

  await expect(page.locator(workspace.nodeById(alpha.id))).toContainText('Alpha Workspace');
  await expect(page.locator(workspace.nodeById(beta.id))).toContainText('Beta Workspace');

  await page.locator(workspace.nodeById(alpha.id)).click();
  await expect.poll(async () => page.evaluate(() => window.sero.layout.load()), {
    timeout: 10_000,
  }).toMatchObject({ activeWorkspaceId: alpha.id });

  await page.evaluate((id) => window.sero.workspace.close(id), beta.id);
  await page.evaluate(() => window.dispatchEvent(new Event('sero:workspace-changed')));
  await expect(page.locator(workspace.nodeById(beta.id))).not.toBeVisible({ timeout: 10_000 });

  const reopened = await addWorkspace(betaDir, 'Beta Workspace');
  await expect(page.locator(workspace.nodeById(reopened.id))).toBeVisible({ timeout: 10_000 });
  expect(fs.existsSync(path.join(betaDir, 'README.md'))).toBe(true);
});

test('persists workspace collapse state across relaunch', async () => {
  const gammaDir = createWorkspaceDir(home.path, 'gamma workspace', { 'src/index.ts': 'export {};\n' });
  const gamma = await addWorkspace(gammaDir, 'Gamma Workspace');
  const node = page.locator(workspace.nodeById(gamma.id));
  await expect(node).toBeVisible({ timeout: 10_000 });

  await node.click();
  await page.evaluate((id) => window.sero.workspace.setExpanded(id, false), gamma.id);
  await closeApp(app);

  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  await expect(page.locator(workspace.nodeById(gamma.id))).toBeVisible({ timeout: 10_000 });
  const reloaded = await page.evaluate((id) => window.sero.workspace.list()
    .then((items) => items.find((item) => item.id === id)), gamma.id);
  expect(reloaded).toMatchObject({ open: false });
});

test('sets host runtime through the workspace API and reflects it in config', async () => {
  const dir = createWorkspaceDir(home.path, 'runtime workspace');
  const ws = await addWorkspace(dir, 'Runtime Workspace');
  const updated = await page.evaluate((id) => window.sero.workspace.setRuntimeBackend(id, 'host'), ws.id);
  expect(updated.runtime.backend).toBe('host');
});

test('apple-container runtime toggle is covered when available', async () => {
  const skipReason = runtimeSkipReason('apple-container');
  test.skip(skipReason !== null, skipReason ?? 'apple-container unavailable');

  const dir = createWorkspaceDir(home.path, 'apple runtime workspace');
  const ws = await addWorkspace(dir, 'Apple Runtime Workspace');
  const updated = await page.evaluate((id) => window.sero.workspace.setRuntimeBackend(id, 'apple-container'), ws.id);
  expect(updated.runtime.backend).toBe('apple-container');
});
