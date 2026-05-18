import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchSeroApp,
  launchWorkflowApp,
  layout,
  waitForShell,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.afterEach(async () => {
  try {
    await closeApp(app);
  } finally {
    home?.cleanup();
  }
});

test('fresh home renders first-run setup and creates a profile', async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    mockRelaunch: true,
    env: { HOME: home.path, USERPROFILE: home.path },
  }));

  await expect(page.getByText('Welcome to Sero')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Profile Name').fill('Test');
  await page.getByRole('button', { name: /get started/i }).click();

  await expect.poll(async () => app.evaluate(() => {
    const calls = (globalThis as { __seroRelaunchCalls?: Array<{ method: string }> })
      .__seroRelaunchCalls ?? [];
    return calls.map((call) => call.method);
  }), { timeout: 10_000 }).toEqual(expect.arrayContaining(['relaunch', 'exit']));

  const profiles = await page.evaluate(() => window.sero.profiles.list());
  expect(profiles).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Test', isActive: true }),
  ]));
});

test('complete profile skips onboarding and boots into the shell', async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    profile: { name: 'Complete', onboarded: true },
  }));

  await waitForShell(page);
  await expect(page.locator(layout.appShell).first()).toBeVisible();
  await expect(page.getByText('Welcome to Sero')).not.toBeVisible();
});
