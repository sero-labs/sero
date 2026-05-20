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

test('opens Environment Doctor from the command menu and renders a quick report', async () => {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
  await page.getByText('Environment Doctor').first().click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Environment Doctor' });
  await expect(dialog.getByRole('heading', { name: 'Environment Doctor' }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Quick' }).click();
  await expect(page.getByText(/Sero .*·/)).toBeVisible({ timeout: 20_000 });

  const report = await page.evaluate(() => window.sero.doctor.runQuick());
  expect(report.system.os).toBe(process.platform);
  expect(report.results.length).toBeGreaterThan(0);
});

test.skip('install/retry buttons require deterministic repair mocks and must not install tools in workflow e2e', async () => {
  // Phase 2 validates rendered diagnostics only.
});
