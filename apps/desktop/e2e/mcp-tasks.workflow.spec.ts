import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  layout,
  waitForShell,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const serverName = 'reports';
const fixturePath = path.resolve(__dirname, 'fixtures/test-mcp-server/server.mts');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let fixture: ChildProcess;
let fixtureUrl = '';
let workspaceId = '';

test.beforeAll(async () => {
  // The fixture runs in its own process, so it keeps the task while Sero restarts.
  fixture = spawn(process.execPath, [fixturePath, '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
  fixtureUrl = await new Promise<string>((resolve, reject) => {
    fixture.once('error', reject);
    fixture.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
  const workspaceDir = createWorkspaceDir(home.path, 'mcp tasks workspace');
  workspaceId = await page.evaluate(async (folderPath) => (
    (await window.sero.workspace.addFolder(folderPath, 'MCP Tasks Workspace')).id
  ), workspaceDir);
  await invokeMcp('mcp_manager', {
    action: 'save_raw_config',
    rawConfig: JSON.stringify({ mcpServers: { [serverName]: { enabled: true, transport: 'http', url: fixtureUrl } } }),
  });
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    fixture.kill();
    home.cleanup();
  }
});

function invokeMcp(toolName: 'mcp' | 'mcp_manager', params: Record<string, unknown>) {
  return page.evaluate(
    ({ id, name, toolParams }) => window.sero.appAgent.invokeTool('mcp', id, name, toolParams),
    { id: workspaceId, name: toolName, toolParams: params },
  );
}

test('finishes a task that started before Sero restarted, and shows its result in the Tasks panel', async () => {
  const started = await invokeMcp('mcp', {
    action: 'call_tool',
    serverName,
    toolName: 'run_report',
    toolArguments: { region: 'EMEA', delayMs: 6_000 },
  });
  const taskId = String(started.details.taskId);
  expect(started.text).toContain(`runs as task ${taskId}`);
  expect((await invokeMcp('mcp', { action: 'task_status', taskId })).text).toContain('running');

  await closeApp(app);
  ({ app, page } = await launchWorkflowApp({ home, profile: false }));
  await waitForShell(page);

  await expect.poll(async () => (await invokeMcp('mcp', { action: 'task_status', taskId })).text, { timeout: 30_000 })
    .toContain('completed');

  expect(await page.evaluate(() => Boolean(window.__appControl?.openApp('mcp')))).toBe(true);
  const mcpApp = page.locator(layout.activeAppPanel).first();
  await mcpApp.getByRole('button', { name: /^Tasks/ }).click();
  const row = mcpApp.getByRole('listitem').filter({ hasText: 'run_report' });
  await expect(row).toContainText('Completed');
  await row.getByRole('button', { name: 'Result' }).click();
  await expect(row).toContainText('report ready: EMEA');
});
