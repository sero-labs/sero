import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  waitForShell,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    mockRelaunch: true,
    profile: { name: 'Primary', onboarded: true },
  }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

async function relaunchCalls(): Promise<string[]> {
  return app.evaluate(() => {
    const calls = (globalThis as { __seroRelaunchCalls?: Array<{ method: string }> })
      .__seroRelaunchCalls ?? [];
    return calls.map((call) => call.method);
  });
}

test('creates a second profile from the profile switcher and requests restart on switch', async () => {
  await page.getByRole('button', { name: /Primary/ }).click();
  await page.getByText('New Profile').click();
  await page.getByPlaceholder('e.g. Personal, Work, Research...').fill('Secondary');
  await page.getByRole('button', { name: 'Create Profile' }).click();
  await expect(page.getByText('Profile Created')).toBeVisible({ timeout: 10_000 });

  const profiles = await page.evaluate(() => window.sero.profiles.list());
  const secondary = profiles.find((profile) => profile.name === 'Secondary');
  expect(secondary).toBeTruthy();
  expect(secondary?.isActive).toBe(false);

  await page.getByRole('button', { name: 'Switch Now' }).click();
  await expect.poll(relaunchCalls, { timeout: 10_000 }).toEqual(expect.arrayContaining(['relaunch', 'exit']));
});

test('removes an inactive profile from the registry without deleting files', async () => {
  const inactive = await page.evaluate(() => window.sero.profiles.create('Remove Me'));
  const retainedFile = path.join(inactive.path, 'retained.txt');
  fs.writeFileSync(retainedFile, 'profile data');

  await page.evaluate((id) => window.sero.profiles.remove(id, 'remove'), inactive.id);
  const profiles = await page.evaluate(() => window.sero.profiles.list());
  expect(profiles.some((profile) => profile.id === inactive.id)).toBe(false);
  expect(fs.existsSync(inactive.path)).toBe(true);
  expect(fs.readFileSync(retainedFile, 'utf8')).toBe('profile data');
});

test('shows a clear two-step profile removal dialog', async () => {
  const primary = await page.evaluate(() => window.sero.profiles.list()
    .then((profiles) => profiles.find((profile) => profile.name === 'Primary')));
  expect(primary).toBeTruthy();
  await page.evaluate((id) => window.sero.profiles.switch(id), primary!.id);
  await page.evaluate(() => window.sero.profiles.create('Research'));
  await page.reload();
  await waitForShell(page);
  await page.getByRole('button', { name: 'Primary', exact: true }).click();
  await page.getByRole('button', { name: 'Manage Research' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Remove profile' })).toBeVisible();
  const retainFiles = dialog.getByRole('button', { name: 'Retain files' });
  const deleteFiles = dialog.getByRole('button', { name: 'Delete files' });
  await expect(retainFiles).toBeVisible();
  await expect(deleteFiles).toBeVisible();

  const [retainBox, deleteBox] = await Promise.all([
    retainFiles.boundingBox(),
    deleteFiles.boundingBox(),
  ]);
  expect(retainBox?.y).toBe(deleteBox?.y);

  await deleteFiles.click();
  await expect(dialog.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
  await expect(dialog.getByText(
    'The profile folder and its workspaces will be deleted. You cannot undo this.',
  )).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByRole('heading', { name: 'Remove profile' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
});

test.skip('custom storage location picker needs a deterministic folder-picker test hook', async () => {
  // Native folder pickers are intentionally not driven in Phase 2 workflow tests.
});
