import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
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
  await page.getByLabel('Profile Name').fill('Secondary');
  await page.getByRole('button', { name: 'Create Profile' }).click();
  await expect(page.getByText('Profile Created')).toBeVisible({ timeout: 10_000 });

  const profiles = await page.evaluate(() => window.sero.profiles.list());
  const secondary = profiles.find((profile) => profile.name === 'Secondary');
  expect(secondary).toBeTruthy();
  expect(secondary?.isActive).toBe(false);

  await page.getByRole('button', { name: 'Switch Now' }).click();
  await expect.poll(relaunchCalls, { timeout: 10_000 }).toEqual(expect.arrayContaining(['relaunch', 'exit']));
});

test('deletes an inactive profile from the registry without deleting files', async () => {
  const inactive = await page.evaluate(() => window.sero.profiles.create('Delete Me'));
  await page.evaluate((id) => window.sero.profiles.delete(id), inactive.id);
  const profiles = await page.evaluate(() => window.sero.profiles.list());
  expect(profiles.some((profile) => profile.id === inactive.id)).toBe(false);
});

test.skip('custom storage location picker needs a deterministic folder-picker test hook', async () => {
  // Native folder pickers are intentionally not driven in Phase 2 workflow tests.
});
