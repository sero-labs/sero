/**
 * The git plugin's diff pane against a real repository.
 *
 * Guards the revision pair each selection maps to: a staged file compared
 * against the working tree instead of HEAD produces a diff that looks entirely
 * plausible and is wrong, which unit tests on their own would not catch.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
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

  wsDir = createWorkspaceDir(home.path, 'git-diff-repo', {
    'src/greet.ts': 'export function greet(name: string) {\n  return `Hello ${name}`;\n}\n',
    'README.md': '# Demo\n\nOriginal line.\n',
  });
  git(['init', '-q'], wsDir);
  git(['config', 'user.email', 'test@example.com'], wsDir);
  git(['config', 'user.name', 'Test'], wsDir);
  git(['add', '.'], wsDir);
  git(['commit', '-qm', 'initial commit'], wsDir);

  // One staged change and one unstaged change, so both revision pairs are exercised.
  fs.writeFileSync(
    path.join(wsDir, 'src/greet.ts'),
    'export function greet(name: string, loud = false) {\n'
    + '  const message = `Hello ${name}`;\n'
    + '  return loud ? message.toUpperCase() : message;\n}\n',
    'utf8',
  );
  git(['add', 'src/greet.ts'], wsDir);
  fs.writeFileSync(path.join(wsDir, 'README.md'), '# Demo\n\nEdited line.\nAdded line.\n', 'utf8');

  await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Git Diff Repo');
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

test('renders a real diff for a changed file', async () => {
  // Make the seeded repo the active workspace — the Git app follows it.
  await page.getByText('Git Diff Repo', { exact: true }).first().click();

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('git')));
  expect(opened).toBe(true);

  // Reading a diff mutates nothing — the stage/unstage buttons are not touched.
  const unstaged = page.getByText('README.md', { exact: true }).first();
  await expect(unstaged).toBeVisible({ timeout: 30_000 });
  await unstaged.click();
  await expect(page.getByText('working tree').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: 'e2e-artifacts/git-diff-unstaged.png' });

  // And the staged side, which must compare against HEAD rather than disk.
  const staged = page.getByText('greet.ts', { exact: true }).first();
  await expect(staged).toBeVisible({ timeout: 15_000 });
  await staged.click();
  await expect(page.getByText('staged').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: 'e2e-artifacts/git-diff-staged.png' });
});
