/**
 * AI conflict resolution, against a real conflicted repository (§7 of
 * docs/features/git-ux.md).
 *
 * **The model is stubbed, the rest is real.** `resolveConflictWithAi` is
 * replaced in the page so the run is deterministic, and everything the step
 * actually builds still runs for real: parsing the markers, rebuilding the
 * file, writing it to disk, staging it through git, the account of what
 * happened, the question that blocks one conflict, and the undo that takes back
 * the machine's work and leaves yours.
 *
 * A live model would test the prompt, which unit tests cover, at the cost of a
 * test that fails for reasons unrelated to the code.
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

/** The failed merge is the fixture, so its failure is expected. */
function gitAllowingFailure(args: string[], cwd: string): void {
  try {
    git(args, cwd);
  } catch {
    // Expected: `merge` of a conflicting branch.
  }
}

/**
 * Two conflicts in one file: the first the model resolves on its own, the
 * second it asks about. That pair is the whole design in one file — automatic
 * where it can be, a specific question where it cannot.
 */
const FILLER = Array.from({ length: 12 }, (_, i) => `// untouched line ${i + 1}`).join('\n');

/**
 * The two changed lines are kept well apart on purpose. Git merges adjacent
 * changes into a *single* conflict block, so neighbouring edits would produce
 * one conflict and quietly stop testing the per-conflict behaviour.
 */
function source(precision: string, currency: string): string {
  return `export const precision = ${precision};\n${FILLER}\nexport const currency = "${currency}";\n`;
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

test('resolves what it can, asks about what it cannot, and undoes only its own work', async () => {
  const dir = createWorkspaceDir(home.path, 'git-ai-repo', { 'src/parse.ts': source('2', 'GBP') });
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['add', '.'], dir);
  git(['commit', '-qm', 'initial commit'], dir);

  git(['switch', '-qc', 'feature'], dir);
  fs.writeFileSync(path.join(dir, 'src/parse.ts'), source('4', 'USD'), 'utf8');
  git(['commit', '-qam', 'raise precision, switch currency'], dir);

  git(['switch', '-q', 'main'], dir);
  fs.writeFileSync(path.join(dir, 'src/parse.ts'), source('3', 'EUR'), 'utf8');
  git(['commit', '-qam', 'nudge precision, switch currency'], dir);
  gitAllowingFailure(['merge', 'feature'], dir);

  await page.evaluate(async ([folderPath, label]) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, label);
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'host');
  }, [dir, 'AI Repo'] as const);
  await page.getByText('AI Repo', { exact: true }).first().click();
  await collapseShellPanels(page);
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('git')));
  expect(opened).toBe(true);

  await expect(page.getByText(/Merging feature in\./)).toBeVisible({ timeout: 30_000 });

  // Stub the model. Conflict 1 resolves; conflict 2 asks, with real options.
  //
  // Replaced in the **main process**, not the page: `window.sero` comes from
  // `contextBridge`, so it is non-configurable and neither assignment nor
  // `defineProperty` can touch it. Swapping the handler leaves the IPC channel,
  // the preload bridge and the whole renderer path real, and stubs only the
  // one call that would need a model provider.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('sero:vcs:resolve-conflict-ai');
    ipcMain.handle('sero:vcs:resolve-conflict-ai', (_event, _ws: string, input: { conflictNumber: number }) =>
      (input.conflictNumber === 1
        ? {
          decision: 'resolve',
          content: 'export const precision = 4;',
          why: 'took incoming — it supersedes the nudge on main',
        }
        : {
          decision: 'ask',
          question: 'main uses EUR and the incoming branch uses USD. Which should I keep?',
          because: 'Nothing in either branch explains the change.',
          options: [
            { label: 'EUR', detail: 'current · main', content: 'export const currency = "EUR";' },
            { label: 'USD', detail: 'incoming', content: 'export const currency = "USD";' },
          ],
        }));
  });

  // Select a commit in the history first. The commit detail is its own panel
  // along the bottom, so the right-hand pane is idle and the account belongs
  // there — but a guard on "nothing is selected" used to suppress it, and the
  // run went invisible: the button vanished and nothing else appeared.
  await page.getByText('initial commit', { exact: true }).first().click();

  await page.getByRole('button', { name: 'Resolve with AI' }).click();

  // The run is visible even with a commit selected.
  await expect(page.getByText('Resolving conflicts')).toBeVisible({ timeout: 20_000 });

  // The account says what it did and why, in one line.
  await expect(page.getByText('took incoming — it supersedes the nudge on main'))
    .toBeVisible({ timeout: 20_000 });

  // The question is the only thing that needs you, and it comes with the
  // actual options rather than "please resolve manually".
  await expect(page.getByText(/main uses EUR and the incoming branch uses USD/)).toBeVisible();
  await expect(page.getByRole('button', { name: /USD/ })).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/git-ai-question.png' });

  // Nothing is concludable while a conflict is still open.
  await expect(page.getByRole('button', { name: 'Conclude merge' })).toBeDisabled();

  await page.getByRole('button', { name: /USD/ }).click();

  // Resolved means written *and* staged, so the merge becomes concludable.
  await expect(page.getByRole('button', { name: 'Conclude merge' }))
    .toBeEnabled({ timeout: 20_000 });

  const resolved = fs.readFileSync(path.join(dir, 'src/parse.ts'), 'utf8');
  expect(resolved).not.toContain('<<<<<<<');
  expect(resolved).toContain('export const precision = 4;');
  expect(resolved).toContain('export const currency = "USD";');

  // The file is marked as the machine's work, and the account stays on screen.
  await expect(page.getByText('Resolved by AI')).toBeVisible();
  await expect(page.getByText('you chose USD (incoming)')).toBeVisible();
  // The question has been answered, so its box is gone — the line now says
  // what you chose. It used to linger, which read as still needing you.
  await expect(page.getByText(/main uses EUR and the incoming branch uses USD/))
    .toBeHidden();
  await page.screenshot({ path: 'e2e-artifacts/git-ai-finished.png' });

  // Undo takes back the machine's resolution and leaves the answered one.
  await page.getByRole('button', { name: 'Undo AI resolutions' }).click();
  await expect
    .poll(() => fs.readFileSync(path.join(dir, 'src/parse.ts'), 'utf8'), { timeout: 20_000 })
    .toContain('<<<<<<<');

  const undone = fs.readFileSync(path.join(dir, 'src/parse.ts'), 'utf8');
  // Your answer survives; the machine's resolution is back to a conflict.
  expect(undone).toContain('export const currency = "USD";');
  expect(undone).toContain('export const precision = 3;');
  expect(undone).toContain('export const precision = 4;');

  // The app has to agree with the file: the merge is unfinished again, and
  // nothing is marked as the machine's any more.
  await expect(page.getByRole('button', { name: 'Conclude merge' }))
    .toBeDisabled({ timeout: 20_000 });
  await expect(page.getByText('Resolved by AI')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo AI resolutions' })).toBeHidden();
  // Git no longer calls the file conflicted — it forgot when the file was
  // staged — so the count here is Sero's own memory, and without it the app
  // would offer to conclude the merge over a file full of markers.
  await expect(page.getByText('1 conflict left to resolve')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolve with AI' })).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/git-ai-undone.png' });
});
