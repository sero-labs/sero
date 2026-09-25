/**
 * Documentation capture: MCP.
 *
 * Writes the MCP guide's screenshots into the docs site. It uses the MCP test
 * server, so it needs no model, account or network. It is opt-in:
 *
 *   SERO_E2E_DOCS_MCP=1 npx playwright test e2e/docs-mcp.workflow.spec.ts --project=workflow
 *
 * Run `pnpm run build` first: the harness launches the built app.
 * SERO_E2E_DOCS_MCP_OUT writes the images to another folder for review.
 */

import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
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
import { createDocsCapture, type DocsCapture } from './helpers/docs-capture';

const ENABLED = process.env.SERO_E2E_DOCS_MCP === '1';
const SHOTS = process.env.SERO_E2E_DOCS_MCP_OUT
  ?? path.resolve(__dirname, '..', '..', 'docs-site', 'docs', 'assets', 'images');
const fixturePath = path.resolve(__dirname, 'fixtures/test-mcp-server/server.mts');

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Documentation capture. Set SERO_E2E_DOCS_MCP=1 to run it.');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let capture: DocsCapture;
let fixture: ChildProcess;
let workspaceId = '';

const mcpPanel = () => page.locator(layout.activeAppPanel).first();

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // Only the docs server offers skills, as a real setup would.
  fixture = spawn(process.execPath, [fixturePath, '--http', '--no-skills'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const fixtureUrl = await new Promise<string>((resolve, reject) => {
    fixture.once('error', reject);
    fixture.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home, args: ['--force-device-scale-factor=2'] }));
  await setWindowHeight(900);
  await waitForShell(page);
  capture = createDocsCapture(page, SHOTS);
  const workspaceDir = createWorkspaceDir(home.path, 'docs workspace');
  workspaceId = await page.evaluate(async (folderPath) => (
    (await window.sero.workspace.addFolder(folderPath, 'Docs')).id
  ), workspaceDir);
  const stdio = (extra: string[] = []) => ({ enabled: true, transport: 'stdio', command: process.execPath, args: [fixturePath, ...extra] });
  await invokeMcp('mcp_manager', {
    action: 'save_raw_config',
    rawConfig: JSON.stringify({
      mcpServers: {
        crm: stdio(['--no-skills']),
        docs: stdio(),
        reports: { enabled: true, transport: 'http', url: fixtureUrl },
        sales: stdio(['--no-skills']),
      },
    }),
  });
  for (const serverName of ['crm', 'docs', 'reports', 'sales']) {
    await invokeMcp('mcp_manager', { action: 'connect_server', serverName });
  }
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    fixture?.kill();
    home?.cleanup();
  }
});

function invokeMcp(toolName: 'mcp' | 'mcp_manager', params: Record<string, unknown>) {
  return page.evaluate(
    ({ id, name, toolParams }) => window.sero.appAgent.invokeTool('mcp', id, name, toolParams),
    { id: workspaceId, name: toolName, toolParams: params },
  );
}

async function openApp(appId: string): Promise<void> {
  expect(await page.evaluate((id) => Boolean(window.__appControl?.openApp(id)), appId)).toBe(true);
}

/** The Linux test machine has no keyring. Its warning is not part of any MCP screen. */
async function dismissKeyringWarning(): Promise<void> {
  const warning = page.getByText('Credentials are not stored securely.');
  if (await warning.isVisible().catch(() => false)) {
    await warning.locator('xpath=ancestor::*[.//button][1]').getByRole('button').last().click();
  }
}

/** The smallest element around `text` whose class list contains `className`. */
function around(scope: Locator, text: string, className: string): Locator {
  return scope.getByText(text, { exact: true }).first().locator(`xpath=ancestor::*[contains(@class, "${className}")][1]`);
}

/** The chat from the top of `from` to the bottom of `to`. */
async function shotChat(name: string, from: Locator, to: Locator): Promise<void> {
  await page.waitForTimeout(400);
  const chat = await page.locator(layout.chatPanel).boundingBox();
  const top = await from.boundingBox();
  const bottom = await to.boundingBox();
  if (!chat || !top || !bottom) throw new Error(`no chat to capture for ${name}`);
  const y = top.y - 16;
  await page.screenshot({
    path: path.join(SHOTS, `${name}.jpg`),
    quality: 92,
    clip: { x: chat.x, y, width: chat.width, height: Math.floor(bottom.y + bottom.height + 4 - y) },
  });
}

async function setWindowHeight(height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, value), height);
  await page.waitForTimeout(300);
}

async function pendingQuestion() {
  await expect.poll(async () => (await page.evaluate(() => window.sero.userFeedback.getPending())).length, { timeout: 20_000 }).toBe(1);
  const [question] = await page.evaluate(() => window.sero.userFeedback.getPending());
  return question!;
}

/** Stores a real tool call of the sales server as the model's call in a new chat, and opens that chat. */
async function openRecordedToolCall(prompt: string, toolName: string, toolArguments: Record<string, unknown>): Promise<void> {
  const result = await invokeMcp('mcp', { action: 'call_tool', serverName: 'sales', toolName, toolArguments });
  const session: SeroSessionInfo = await page.evaluate((id) => window.sero.sessions.create(id), workspaceId);
  const now = Date.now();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const assistant = { api: 'openai-responses', provider: 'openai', model: 'docs', usage, timestamp: now };
  const argumentText = Object.entries(toolArguments).map(([key, value]) => ` --${key} ${String(value)}`).join('');
  const messages = [
    { role: 'user', content: prompt, timestamp: now },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call-1', name: 'sero-cli', arguments: { command: `mcp call sales ${toolName}${argumentText}` } }],
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

test('servers, the add form and the server details', async () => {
  await openApp('mcp');
  await dismissKeyringWarning();
  const panel = mcpPanel();
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(panel.getByText('Connected: 4')).toBeVisible({ timeout: 30_000 });
  await capture.shotElement('mcp', panel, { pad: 0 });

  await panel.getByRole('button', { name: 'Add server' }).click();
  await capture.shotElement('mcp-server', around(panel, 'Add MCP server', 'rounded-xl'));
  await panel.getByRole('button', { name: 'Cancel' }).click();

  const docsRow = around(panel, 'docs', 'rounded-lg');
  await docsRow.getByRole('button', { name: 'Show details' }).click();
  await expect(docsRow.getByText('Skills', { exact: true })).toBeVisible();
  await capture.shotElement('mcp-protocol', around(docsRow, 'Protocol', 'rounded-xl'));
  await docsRow.getByRole('button', { name: 'Hide details' }).click();

  const reportsRow = around(panel, 'reports', 'rounded-lg');
  await reportsRow.getByRole('button', { name: 'Show details' }).click();
  await expect(reportsRow.getByText('Tasks', { exact: true })).toBeVisible();
  await reportsRow.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await capture.shotElement('mcp-manager', reportsRow, { pad: 0 });
  await panel.getByRole('button', { name: 'Hide details' }).click();
});

test('remote skills', async () => {
  const panel = mcpPanel();
  await panel.getByRole('button', { name: 'Remote skills', exact: true }).click();
  const skills = panel.locator('[aria-labelledby="mcp-skills-title"]');
  const releaseNotes = skills.getByRole('listitem').filter({ hasText: 'docs / release-notes' });
  await expect(releaseNotes).toBeVisible({ timeout: 20_000 });
  await releaseNotes.getByRole('switch').click();
  await expect(skills.getByText('1 of 2 on')).toBeVisible();
  await capture.shotElement('mcp-remote-skills', skills);
  await panel.getByRole('button', { name: 'Remote skills', exact: true }).click();
});

test('tasks', async () => {
  await invokeMcp('mcp', { action: 'call_tool', serverName: 'reports', toolName: 'run_report', toolArguments: { region: 'EMEA', delayMs: 1_000 } });
  await invokeMcp('mcp', { action: 'call_tool', serverName: 'reports', toolName: 'run_report', toolArguments: { region: 'APAC', plan: 'fail', delayMs: 1_000 } });
  await invokeMcp('mcp', { action: 'call_tool', serverName: 'reports', toolName: 'run_report', toolArguments: { region: 'AMER', delayMs: 600_000 } });
  const panel = mcpPanel();
  await panel.getByRole('button', { name: /^Tasks/ }).click();
  const tasks = panel.getByRole('list').filter({ hasText: 'run_report' });
  await expect(tasks.getByRole('listitem').filter({ hasText: 'Completed' })).toBeVisible({ timeout: 30_000 });
  await expect(tasks.getByRole('listitem').filter({ hasText: 'Failed' })).toBeVisible({ timeout: 30_000 });
  const completed = tasks.getByRole('listitem').filter({ hasText: 'Completed' });
  await completed.getByRole('button', { name: 'Result' }).click();
  await expect(completed).toContainText('report ready: EMEA');
  await capture.shotElement('mcp-tasks', panel.locator('[aria-labelledby="mcp-tasks-title"]'));
  await panel.getByRole('button', { name: /^Tasks/ }).click();
});

test('a server question in User Feedback', async () => {
  const call = invokeMcp('mcp', { action: 'call_tool', serverName: 'crm', toolName: 'create_contact' });
  const question = await pendingQuestion();
  await openApp('userfeedback');
  const feedback = page.locator(layout.activeAppPanel).first();
  await expect(feedback.getByText('Which company does the contact work for?')).toBeVisible({ timeout: 20_000 });
  // The question card fills the pane. A shorter window keeps the picture about the question.
  await setWindowHeight(520);
  await capture.shotElement('mcp-server-question', feedback, { pad: 0 });
  await setWindowHeight(900);
  await page.evaluate((id) => window.sero.userFeedback.answer({ id, cancelled: true, answers: [] }), question.id);
  await call;
});

test('an MCP app in the chat, and its permission question', async () => {
  await openRecordedToolCall('Show the EMEA sales dashboard.', 'show_dashboard', { region: 'EMEA' });
  const chat = page.locator(layout.chatPanel);
  const viewer = chat.frameLocator('iframe[title="sales show_dashboard app"]');
  const mcpApp = viewer.frameLocator('iframe[title="MCP app"]');
  await expect(mcpApp.locator('#result')).toHaveText('dashboard for EMEA', { timeout: 20_000 });
  await mcpApp.locator('#refresh').click();
  await expect(viewer.locator('#status')).toHaveText('App called refresh_dashboard');
  const appFrame = chat.locator('iframe[title="sales show_dashboard app"]');
  await shotChat('mcp-app-chat', chat.getByText('Show the EMEA sales dashboard.').last(), appFrame);

  await openRecordedToolCall('Copy the sales summary.', 'show_clipboard', {});
  const question = await pendingQuestion();
  const prompt = chat.getByText('Allow the app to write to your clipboard?');
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  await capture.shotElement('mcp-app-permission', prompt.locator('xpath=ancestor::*[contains(@class, "rounded-lg") and contains(@class, "border")][1]'), { pad: 12 });
  await page.evaluate((id) => window.sero.userFeedback.answer({ id, cancelled: true, answers: [] }), question.id);
});
