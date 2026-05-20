import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import type { SeroSessionInfo } from '../src/types/ipc';
import {
  chat,
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  waitForShell,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let session: SeroSessionInfo;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  const workspaceDir = createWorkspaceDir(home.path, 'chat workspace');
  session = await page.evaluate(async (folderPath) => {
    const ws = await window.sero.workspace.addFolder(folderPath, 'Chat Workspace');
    const created = await window.sero.sessions.create(ws.id);
    await window.sero.agent.open(created.id, created.path, ws.id);
    await window.sero.sessions.rename(created.id, 'Chat UI Session');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return { ...created, name: 'Chat UI Session' };
  }, workspaceDir);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('types into an active chat composer without provider credentials', async () => {
  await page.locator(`[data-testid="session-item"][data-session-id="${session.id}"]`).click();
  const input = page.locator(chat.input);
  await expect(input).toBeEnabled({ timeout: 10_000 });

  await input.fill('Draft message that should not call a provider');
  await expect(input).toHaveValue('Draft message that should not call a provider');
  await expect(page.locator(chat.submitButton)).toBeEnabled();
});

test('shows slash command UI when commands are available', async () => {
  const commands = await page.evaluate((sessionId) => window.sero.agent.getCommands(sessionId), session.id);
  test.skip(commands.length === 0, 'No slash commands available in this test profile.');

  await page.locator(chat.input).fill('/');
  await expect(page.getByText(/Extensions|Prompts|Skills/).first()).toBeVisible({ timeout: 10_000 });
});

test('model state controls are reachable without sending a prompt', async () => {
  const state = await page.evaluate((sessionId) => window.sero.agent.getModelState(sessionId), session.id);
  expect(state === null || typeof state === 'object').toBe(true);
  await expect(page.locator(chat.input)).toBeEnabled();
});

test.skip('streaming, abort, and checkpoint restore require deterministic agent realism from Phase 4', async () => {
  // Phase 2 intentionally avoids real provider calls.
});
