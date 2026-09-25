import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { SeroSessionInfo } from '../src/types/ipc';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  layout,
  sidebar,
  waitForShell,
  type TempSeroHome,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const serverName = 'e2e-fixture';
const serverPath = path.resolve(__dirname, 'fixtures/test-mcp-server/server.mts');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
  const workspaceDir = createWorkspaceDir(home.path, 'mcp apps workspace');
  workspaceId = await page.evaluate(async (folderPath) => (
    (await window.sero.workspace.addFolder(folderPath, 'MCP Apps Workspace')).id
  ), workspaceDir);
  await invokeMcp('mcp_manager', {
    action: 'save_raw_config',
    rawConfig: JSON.stringify({
      mcpServers: { [serverName]: { enabled: true, transport: 'stdio', command: process.execPath, args: [serverPath] } },
    }),
  });
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

function invokeMcp(toolName: 'mcp' | 'mcp_manager', params: Record<string, unknown>) {
  return page.evaluate(
    ({ id, name, toolParams }) => window.sero.appAgent.invokeTool('mcp', id, name, toolParams),
    { id: workspaceId, name: toolName, toolParams: params },
  );
}

/**
 * Runs a real MCP tool call, then stores it in a new session as the model's
 * sero-cli call with that result, and opens the session in the chat.
 */
async function openRecordedToolCall(toolName: string, toolArguments: Record<string, unknown>): Promise<void> {
  const result = await invokeMcp('mcp', { action: 'call_tool', serverName, toolName, toolArguments });
  const session: SeroSessionInfo = await page.evaluate((id) => window.sero.sessions.create(id), workspaceId);
  const now = Date.now();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const assistant = { api: 'openai-responses', provider: 'openai', model: 'e2e', usage, timestamp: now };
  const messages = [
    { role: 'user', content: `Run ${toolName}.`, timestamp: now },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call-1', name: 'sero-cli', arguments: { command: `mcp call_tool --server ${serverName} --tool ${toolName}` } }],
      stopReason: 'toolUse',
      ...assistant,
    },
    {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'sero-cli',
      content: [{ type: 'text', text: result.text }],
      details: { exitCode: 0, ...result.details },
      isError: false,
      timestamp: now,
    },
    { role: 'assistant', content: [{ type: 'text', text: 'Done.' }], stopReason: 'stop', ...assistant },
  ];
  const lines = messages.map((message, index) => JSON.stringify({
    type: 'message',
    id: `entry-${index}`,
    parentId: index === 0 ? null : `entry-${index - 1}`,
    timestamp: new Date(now).toISOString(),
    message,
  }));
  fs.appendFileSync(session.path, `${lines.join('\n')}\n`, 'utf8');

  await page.evaluate(async ({ id, sessionPath, ws }) => {
    await window.sero.agent.open(id, sessionPath, ws);
    window.dispatchEvent(new Event('sero:workspace-changed'));
  }, { id: session.id, sessionPath: session.path, ws: workspaceId });
  await page.locator(sidebar.sessionById(session.id)).click();
}

test('shows an MCP app inline for a model tool call, and the app calls its own tool', async () => {
  const tools = await invokeMcp('mcp', { action: 'list_tools', serverName });
  expect(tools.text).toContain('- show_dashboard');
  expect(tools.text).not.toContain('refresh_dashboard');

  await openRecordedToolCall('show_dashboard', { region: 'EMEA' });

  const viewer = page.locator(layout.chatPanel).frameLocator(`iframe[title="${serverName} show_dashboard app"]`);
  const mcpApp = viewer.frameLocator('iframe[title="MCP app"]');
  await expect(mcpApp.locator('#input')).toHaveText('region: EMEA', { timeout: 20_000 });
  await expect(mcpApp.locator('#result')).toHaveText('dashboard for EMEA');

  await mcpApp.locator('#refresh').click();
  await expect(mcpApp.locator('#refreshed')).toHaveText('refreshed');
  await expect(viewer.locator('#status')).toHaveText('App called refresh_dashboard');
});

test('asks before an app gets a permission, and passes an allowed one to the app frame', async () => {
  await openRecordedToolCall('show_clipboard', {});

  await expect.poll(async () => (await page.evaluate(() => window.sero.userFeedback.getPending())).length, { timeout: 20_000 }).toBe(1);
  const [question] = await page.evaluate(() => window.sero.userFeedback.getPending());
  expect(question?.context?.source).toBe(`${serverName} · show_clipboard app`);
  expect(question?.questions[0]?.label).toBe('Allow the app to write to your clipboard?');
  await page.evaluate((id) => window.sero.userFeedback.answer({
    id,
    cancelled: false,
    answers: [{ questionId: 'app-permissions', value: 'allow', label: 'Allow', wasCustom: false }],
  }), question!.id);

  const viewerFrame = page.locator(layout.chatPanel).locator(`iframe[title="${serverName} show_clipboard app"]`);
  await expect(viewerFrame).toHaveAttribute('allow', 'clipboard-write', { timeout: 20_000 });
  await expect(page.frameLocator(`iframe[title="${serverName} show_clipboard app"]`).locator('iframe[title="MCP app"]'))
    .toHaveAttribute('allow', 'clipboard-write');
});

test('keeps the text result and shows one line when Sero cannot show the app', async () => {
  await openRecordedToolCall('show_unsupported', {});

  await expect(page.locator(layout.chatPanel).getByText(/^App not shown: .*is not HTML/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(layout.chatPanel).getByText('unsupported app').first()).toBeVisible();
});
