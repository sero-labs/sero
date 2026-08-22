/**
 * The hard states, against real repositories: a stopped merge, a repository
 * with no commits, and a detached HEAD.
 *
 * These are the states the app is judged on and the ones unit tests cannot
 * reach — each needs git in a genuinely awkward condition, and the mode has to
 * survive the round trip through `state.json` before any of the UI is right.
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

/** Merging conflicting branches fails on purpose; the failure is the fixture. */
function gitAllowingFailure(args: string[], cwd: string): void {
  try {
    git(args, cwd);
  } catch {
    // Expected for `merge` and `checkout` of a conflicting state.
  }
}

function initRepo(dir: string): void {
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
}

/** The shell panels toggle, so the tests have to remember which way they are. */
let shellCollapsed = false;

async function openWorkspace(dir: string, name: string): Promise<void> {
  await page.evaluate(async ([folderPath, label]) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, label);
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'host');
  }, [dir, name] as const);

  // The workspace tree is how a workspace is switched, so it has to be on
  // screen — the previous test left it collapsed.
  if (shellCollapsed) await collapseShellPanels(page);
  await page.getByText(name, { exact: true }).first().click();
  await collapseShellPanels(page);
  shellCollapsed = true;
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('git')));
  expect(opened).toBe(true);
}

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

test('announces a stopped merge and resolves a conflict from the pane', async () => {
  const dir = createWorkspaceDir(home.path, 'git-conflict-repo', {
    'src/parse.ts': 'export const precision = 2;\n',
  });
  initRepo(dir);
  git(['add', '.'], dir);
  git(['commit', '-qm', 'initial commit'], dir);

  git(['switch', '-qc', 'feature'], dir);
  fs.writeFileSync(path.join(dir, 'src/parse.ts'), 'export const precision = 4;\n', 'utf8');
  git(['commit', '-qam', 'raise precision'], dir);

  git(['switch', '-q', 'main'], dir);
  fs.writeFileSync(path.join(dir, 'src/parse.ts'), 'export const precision = 3;\n', 'utf8');
  git(['commit', '-qam', 'nudge precision'], dir);
  gitAllowingFailure(['merge', 'feature'], dir);

  await openWorkspace(dir, 'Conflict Repo');

  // The mode announces itself and carries the only way out of it.
  await expect(page.getByText(/Merging feature in\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Abort merge' })).toBeVisible();

  // Grouped by what you must do about each file.
  await expect(page.getByText('Conflicts', { exact: true })).toBeVisible();

  // Sync is disabled, not hidden, while the merge is unfinished.
  await expect(page.getByRole('button', { name: 'Push' })).toBeDisabled();

  // The commit button counts down instead of failing later.
  await expect(page.getByRole('button', { name: 'Conclude merge' })).toBeDisabled();
  await expect(page.getByText('1 conflict left to resolve')).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/git-state-conflict.png' });

  // The resolver: the library renders it, our buttons persist the choice.
  await page.getByText('src/parse.ts', { exact: true }).first().click();
  const acceptCurrent = page.getByRole('button', { name: 'Accept current change' }).first();
  await expect(acceptCurrent).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'e2e-artifacts/git-state-resolver.png' });
  await acceptCurrent.click();

  // Resolved means written *and* staged, so the merge becomes concludable.
  await expect(page.getByRole('button', { name: 'Conclude merge' })).toBeEnabled({
    timeout: 20_000,
  });
  expect(fs.readFileSync(path.join(dir, 'src/parse.ts'), 'utf8')).not.toContain('<<<<<<<');
  await page.screenshot({ path: 'e2e-artifacts/git-state-resolved.png' });
});

test('offers the first commit in a repository with no commits', async () => {
  const dir = createWorkspaceDir(home.path, 'git-unborn-repo', {
    'README.md': '# currency-report\n',
  });
  initRepo(dir);

  await openWorkspace(dir, 'Unborn Repo');

  await expect(page.getByText('no commits yet')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Create the first commit' })).toBeVisible();
  await expect(page.getByText('No history yet')).toBeVisible();
  // Nothing to push to, so the slot offers the step that comes first.
  await expect(page.getByRole('button', { name: 'Publish to GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fetch' })).toBeDisabled();
  await page.screenshot({ path: 'e2e-artifacts/git-state-unborn.png' });
});

test('says plainly what a detached HEAD will cost, and offers both ways out', async () => {
  const dir = createWorkspaceDir(home.path, 'git-detached-repo', {
    'README.md': '# Demo\n',
  });
  initRepo(dir);
  // With a remote in play, fetch being on is a decision rather than an accident
  // of there being nothing to fetch from.
  git(['remote', 'add', 'origin', 'https://example.invalid/demo.git'], dir);
  git(['add', '.'], dir);
  git(['commit', '-qm', 'initial commit'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo\n\nSecond.\n', 'utf8');
  git(['commit', '-qam', 'second commit'], dir);
  git(['checkout', '-q', 'HEAD~1'], dir);

  await openWorkspace(dir, 'Detached Repo');

  await expect(page.getByText(/You're not on a branch\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Create branch here' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Return to main/ })).toBeVisible();

  // Fetch is harmless here and stays on; push and PR are off.
  await expect(page.getByRole('button', { name: 'Fetch' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Push' })).toBeDisabled();
  await expect(page.getByText(/Name a branch first/)).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/git-state-detached.png' });
});
