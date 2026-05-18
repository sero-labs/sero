import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import type { SeroSessionInfo } from '../src/types/ipc';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  waitForShell,
  workspace,
  type TempSeroHome,
} from './helpers';

let home: TempSeroHome;
let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  try {
    await closeApp(app);
  } finally {
    app = undefined;
    home?.cleanup();
  }
});

test('relaunches with the same temp home and preserves workspace/session state', async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  const setup = await page.evaluate(async (folderPath) => {
    const ws = await window.sero.workspace.addFolder(folderPath, 'Resilient Workspace');
    const session = await window.sero.sessions.create(ws.id);
    await window.sero.agent.open(session.id, session.path, ws.id);
    await window.sero.sessions.rename(session.id, 'Resilient Session');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return { ws, session: { ...session, name: 'Resilient Session' } };
  }, createWorkspaceDir(home.path, 'resilient workspace'));

  await expect(page.locator(workspace.nodeById(setup.ws.id))).toBeVisible({ timeout: 10_000 });
  await closeApp(app);

  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  await expect(page.locator(workspace.nodeById(setup.ws.id))).toContainText('Resilient Workspace', { timeout: 10_000 });
  const sessions = await page.evaluate((workspaceId) => window.sero.sessions.list(workspaceId), setup.ws.id);
  expect(sessions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: setup.session.id }),
  ]));
});

test('corrupt workspaces.json does not crash-loop the app', async () => {
  home = createTempSeroHome();
  const agentDir = path.join(home.path, 'agent');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'workspaces.json'), '{ this is not json', 'utf8');

  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
  await expect(page.getByTestId('main-sidebar-panel').getByText('Workspaces')).toBeVisible({ timeout: 10_000 });
});

test('corrupt session jsonl is ignored while other sessions load', async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);

  const good: SeroSessionInfo = await page.evaluate(async () => {
    const session = await window.sero.sessions.create('global');
    await window.sero.agent.open(session.id, session.path, 'global');
    await window.sero.sessions.rename(session.id, 'Good Session');
    return { ...session, name: 'Good Session' };
  });
  fs.writeFileSync(path.join(path.dirname(good.path), 'broken.jsonl'), 'not-json\n', 'utf8');

  await closeApp(app);
  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);
  const sessions = await page.evaluate(() => window.sero.sessions.list('global'));
  expect(sessions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: good.id }),
  ]));
});
