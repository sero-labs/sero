/**
 * The titlebar git popover, contributed by `sero-git-plugin`.
 *
 * Guards the step-6 move: the host's own titlebar controls are gone, so if the
 * plugin's contribution fails to mount there is no git anything in the title
 * bar. A named-only export mounts blank and reports nothing but a federation
 * warning, which is exactly what this catches.
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

  const wsDir = createWorkspaceDir(home.path, 'git-titlebar-repo', {
    'README.md': '# Demo\n\nOriginal line.\n',
  });
  git(['init', '-q'], wsDir);
  git(['config', 'user.email', 'test@example.com'], wsDir);
  git(['config', 'user.name', 'Test'], wsDir);
  git(['add', '.'], wsDir);
  git(['commit', '-qm', 'initial commit'], wsDir);
  fs.writeFileSync(path.join(wsDir, 'README.md'), '# Demo\n\nEdited line.\n', 'utf8');

  await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Git Titlebar Repo');
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

test('opens the contributed popover and offers the quick actions', async () => {
  await page.getByText('Git Titlebar Repo', { exact: true }).first().click();
  await collapseShellPanels(page);

  // The trigger carries the branch and one count.
  const trigger = page.getByRole('button', { name: 'Git quick actions' });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();

  // The files it is about to commit, the commit box, then sync.
  const popover = page.locator('[data-radix-popper-content-wrapper]');
  await expect(popover.getByText('README.md', { exact: true })).toBeVisible();
  await expect(popover.getByRole('button', { name: /^Commit \d+ files? ⌘↵$/ })).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Open Git' })).toBeVisible();

  // No remote in the fixture: sync is disabled, not hidden, and says why.
  await expect(popover.getByRole('button', { name: 'Fetch' })).toBeDisabled();
  await expect(popover.getByText(/no remote/)).toBeVisible();

  // What §5 removed must stay removed.
  await expect(popover.getByText('Ship deck')).toHaveCount(0);
  await expect(popover.getByText('Pull request')).toHaveCount(0);

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e-artifacts/git-titlebar-popover.png' });
});
