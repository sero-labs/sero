import fs from 'node:fs';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import type { SeroSessionInfo } from '../src/types/ipc';
import {
  chat,
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  layout,
  sidebar,
  waitForShell,
  workspace,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;
let firstSession: SeroSessionInfo;
let secondSession: SeroSessionInfo;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  const workspaceDir = createWorkspaceDir(home.path, 'sessions workspace');
  const setup = await page.evaluate(async (folderPath) => {
    const ws = await window.sero.workspace.addFolder(folderPath, 'Sessions Workspace');
    const first = await window.sero.sessions.create(ws.id);
    await window.sero.agent.open(first.id, first.path, ws.id);
    await window.sero.sessions.rename(first.id, 'Alpha Session');
    const second = await window.sero.sessions.create(ws.id);
    await window.sero.agent.open(second.id, second.path, ws.id);
    await window.sero.sessions.rename(second.id, 'Beta Session');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return { ws, first: { ...first, name: 'Alpha Session' }, second: { ...second, name: 'Beta Session' } };
  }, workspaceDir);

  appendUserMessage(setup.first.path, 'Alpha Session');
  appendUserMessage(setup.second.path, 'Beta Session');
  await page.evaluate(() => window.dispatchEvent(new Event('sero:workspace-changed')));

  workspaceId = setup.ws.id;
  firstSession = setup.first;
  secondSession = setup.second;
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

function appendUserMessage(sessionPath: string, text: string) {
  fs.appendFileSync(
    sessionPath,
    `${JSON.stringify({
      id: `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'message',
      message: { role: 'user', content: text },
    })}\n`,
    'utf8',
  );
}

function sessionById(id: string) {
  return page.locator(sidebar.sessionById(id));
}

test('shows workspace-bound sessions in the sidebar', async () => {
  await expect(page.locator(workspace.nodeById(workspaceId))).toBeVisible({ timeout: 10_000 });
  await expect(sessionById(firstSession.id)).toContainText('Alpha Session', { timeout: 10_000 });
  await expect(sessionById(secondSession.id)).toContainText('Beta Session', { timeout: 10_000 });
});

test('switches sessions and remounts the chat panel for each session', async () => {
  await sessionById(firstSession.id).click();
  await expect(page.locator(chat.input)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator(layout.chatPanel).getByText('Alpha Session')).toBeVisible({ timeout: 10_000 });

  await sessionById(secondSession.id).click();
  await expect(page.locator(chat.input)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator(layout.chatPanel).getByText('Beta Session')).toBeVisible({ timeout: 10_000 });
});

test('filters sessions by sidebar search query', async () => {
  await page.locator(sidebar.searchInput).fill('Alpha');
  await expect(sessionById(firstSession.id)).toBeVisible({ timeout: 10_000 });
  await expect(sessionById(secondSession.id)).not.toBeVisible();
  await page.locator(sidebar.searchInput).fill('');
});

test('persists sessions across app restart and deletes from disk', async () => {
  expect(fs.existsSync(firstSession.path)).toBe(true);
  await closeApp(app);

  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  await expect(sessionById(firstSession.id)).toContainText('Alpha Session', { timeout: 10_000 });

  await page.evaluate((sessionPath) => window.sero.sessions.delete(sessionPath), firstSession.path);
  await page.evaluate(() => window.dispatchEvent(new Event('sero:workspace-changed')));
  await expect(sessionById(firstSession.id)).not.toBeVisible({ timeout: 10_000 });
  expect(fs.existsSync(firstSession.path)).toBe(false);
});
