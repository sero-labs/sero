import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  layout,
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

async function openCommandMenu(): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
}

test('theme toggle persists through layout.json across restart', async () => {
  const before = await page.evaluate(() => window.sero.layout.load());
  await openCommandMenu();
  await page.getByText('Toggle Light / Dark / System').click();

  await expect.poll(async () => page.evaluate(() => window.sero.layout.load()), {
    timeout: 10_000,
  }).not.toEqual(before);
  const saved = await page.evaluate(() => window.sero.layout.load());
  expect(saved?.theme).toEqual(expect.stringMatching(/light|dark|system/));

  await closeApp(app);
  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  const reloaded = await page.evaluate(() => window.sero.layout.load());
  expect(reloaded?.theme).toBe(saved?.theme);
});

test('sidebar and chat collapse states persist via layout IPC', async () => {
  await page.locator(layout.sidebarToggle).click();
  await page.locator(layout.chatToggle).click();

  await expect.poll(async () => page.evaluate(() => window.sero.layout.load()), {
    timeout: 10_000,
  }).toMatchObject({ mainSidebarOpen: false, chatPanelOpen: false });

  await closeApp(app);
  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  const reloaded = await page.evaluate(() => window.sero.layout.load());
  expect(reloaded).toEqual(expect.objectContaining({
    mainSidebarOpen: false,
    chatPanelOpen: false,
  }));
});

test.skip('window size and API-key settings persistence need product-level deterministic UI hooks', async () => {
  // Layout state is covered above without using localStorage/sessionStorage.
});
