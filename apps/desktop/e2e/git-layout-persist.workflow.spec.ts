/**
 * The Git app's layout is a choice, and choices are remembered.
 *
 * The rail's sections and the history band were plain component state, so
 * leaving the app and coming back reopened everything someone had deliberately
 * folded away. The pieces are unit-tested on their own; what this covers is the
 * wiring between them — the app reading the saved layout, and writing it back.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  collapseShellPanels,
  launchWorkflowApp,
  waitForShell,
  type TempSeroHome,
} from './helpers';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let wsDir: string;

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  wsDir = createWorkspaceDir(home.path, 'layout-repo', { 'README.md': '# Demo\n' });
  git(['init', '-q'], wsDir);
  git(['config', 'user.email', 'test@example.com'], wsDir);
  git(['config', 'user.name', 'Test'], wsDir);
  git(['add', '.'], wsDir);
  git(['commit', '-qm', 'initial commit'], wsDir);

  await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Layout Repo');
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'host');
  }, wsDir);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('remembers a folded rail and a collapsed history', async () => {
  await page.getByText('Layout Repo', { exact: true }).first().click();
  await collapseShellPanels(page);
  await page.evaluate(() => window.__appControl?.openApp('git'));
  await page.getByText('History', { exact: true }).first().waitFor({ timeout: 30_000 });

  // Fold STASHES and collapse the history band.
  await page.getByText('STASHES', { exact: true }).first().click();
  await page.getByText('History', { exact: true }).first().click();
  await expect(page.getByText('Stash changes')).toBeHidden();

  await expect
    .poll(() => {
      const file = path.join(wsDir, '.sero/apps/git/view.json');
      return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) : null;
    }, { timeout: 10_000 })
    .toMatchObject({ stashesOpen: false, graphCollapsed: true, localOpen: true });

  // Leave the app and come back: the layout is how it was left.
  await page.evaluate(() => window.__appControl?.openApp('chat'));
  await page.evaluate(() => window.__appControl?.openApp('git'));
  await page.getByText('History', { exact: true }).first().waitFor({ timeout: 30_000 });

  await expect(page.getByText('Stash changes')).toBeHidden();
  await expect(page.getByText('initial commit')).toBeHidden();
  await expect(page.getByText('LOCAL', { exact: true })).toBeVisible();
});
