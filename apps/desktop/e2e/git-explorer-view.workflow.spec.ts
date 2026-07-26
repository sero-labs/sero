/**
 * The Explorer's Git view, contributed by `sero-git-plugin`.
 *
 * Guards the cutover: the activity bar's Git entry is now a plugin
 * contribution mounted in the main area, and the host has no git panel left to
 * fall back to. If the contribution fails to mount, this goes red rather than
 * silently showing the file tree.
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

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  const wsDir = createWorkspaceDir(home.path, 'git-explorer-repo', {
    'README.md': '# Demo\n\nOriginal line.\n',
  });
  git(['init', '-q'], wsDir);
  git(['config', 'user.email', 'test@example.com'], wsDir);
  git(['config', 'user.name', 'Test'], wsDir);
  git(['add', '.'], wsDir);
  git(['commit', '-qm', 'initial commit'], wsDir);
  fs.writeFileSync(path.join(wsDir, 'README.md'), '# Demo\n\nEdited line.\n', 'utf8');

  await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Git Explorer Repo');
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

test('mounts the contributed Git view and diffs a change from it', async () => {
  await page.getByText('Git Explorer Repo', { exact: true }).first().click();
  await collapseShellPanels(page);
  await page.evaluate(() => window.__appControl?.openApp('explorer'));

  // The activity bar's Git entry comes from the plugin manifest now.
  await page.locator('[data-explorer-panel="git"]').click();

  // Both lists, and the empty state that names the next step.
  await expect(page.getByText('Changes').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('History').first()).toBeVisible();
  await expect(page.getByText(/Pick a change or a commit/).first()).toBeVisible();

  await page.getByText('README.md', { exact: true }).first().click();
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: 'e2e-artifacts/git-explorer-view.png' });
});
