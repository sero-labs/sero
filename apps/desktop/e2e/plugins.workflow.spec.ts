import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  layout,
  waitForShell,
  workspace,
  type TempSeroHome,
} from './helpers';

const uiPluginApps = ['admin', 'cron', 'git', 'mcp', 'userfeedback', 'web'];
const forbiddenPanelText = [
  'No UI module registered',
  'No workspace selected',
  'App crashed while rendering',
];

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    runtime: 'host',
    env: { SERO_HOST_FIRST: '1' },
  }));
  await waitForShell(page);

  const workspaceDir = createWorkspaceDir(home.path, 'plugin workflow workspace', {
    'README.md': '# plugin workflow\n',
  });
  const ws = await page.evaluate(async ({ folderPath, name }) => {
    const created = await window.sero.workspace.addFolder(folderPath, name);
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return created;
  }, { folderPath: workspaceDir, name: 'Plugin Workflow Workspace' });

  await expect(page.locator(workspace.nodeById(ws.id))).toBeVisible({ timeout: 10_000 });
  await page.locator(workspace.nodeById(ws.id)).click();
  await expect.poll(() => page.evaluate(() => window.sero.layout.load()), {
    timeout: 10_000,
  }).toMatchObject({ activeWorkspaceId: ws.id });
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('Built-in plugin UI workflow smoke', () => {
  for (const appId of uiPluginApps) {
    test(`opens ${appId} plugin UI`, async () => {
      const opened = await page.evaluate((id) => Boolean(window.__appControl?.openApp(id)), appId);
      expect(opened).toBe(true);

      await expect(page.locator(`[data-app="${appId}"]`).first()).toBeVisible({ timeout: 20_000 });
      const panel = page.locator(layout.activeAppPanel).first();
      await expect(panel).toBeVisible();
      for (const text of forbiddenPanelText) {
        await expect(panel).not.toContainText(text);
      }
    });
  }

  test('keeps the active pre-built admin layout after another plugin loads', async () => {
    await page.locator(layout.sidebarToggle).click();
    await page.locator(layout.chatToggle).click();
    await expect.poll(async () => {
      const sidebar = await page.locator(layout.sidebarPanel).first().boundingBox();
      const chat = await page.locator(layout.chatPanel).first().boundingBox();
      return Math.max(sidebar?.width ?? 0, chat?.width ?? 0);
    }).toBeLessThan(5);

    const openedCron = await page.evaluate(() => Boolean(window.__appControl?.openApp('cron')));
    expect(openedCron).toBe(true);
    await expect(page.locator('[data-app="cron"]').first()).toBeVisible({ timeout: 20_000 });

    const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('admin')));
    expect(opened).toBe(true);

    const admin = page.locator('[data-app="admin"]').first();
    await expect(admin).toBeVisible({ timeout: 20_000 });
    await admin.getByRole('button', { name: 'Plugins', exact: true }).click();

    const installSource = admin.locator('#plugin-install-source');
    await expect(installSource).toBeVisible();
    const installControls = installSource.locator('xpath=../..');

    await expect.poll(() => installControls.evaluate((element) => (
      getComputedStyle(element).flexDirection
    ))).toBe('row');
  });
});
