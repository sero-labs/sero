import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import type { WorkspaceInfo } from '../src/types/ipc';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  currentRuntimeFromEnv,
  launchWorkflowApp,
  runtimeSkipReason,
  waitForShell,
  type TempSeroHome,
} from './helpers';

const selectedRuntime = currentRuntimeFromEnv() ?? 'host';
const platformSkipReason = runtimeSkipReason('host');

test.skip(
  selectedRuntime !== 'host' || platformSkipReason !== null,
  platformSkipReason ?? 'runtime-host.workflow.spec.ts requires SERO_E2E_RUNTIME=host',
);

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let ws: WorkspaceInfo;
let wsDir: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home, runtime: 'host' }));
  await waitForShell(page);
  wsDir = createWorkspaceDir(home.path, 'host runtime workspace', {
    'package.json': '{"scripts":{"dev":"node server.js"}}\n',
  });
  ws = await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Host Runtime Workspace');
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'host');
    return workspace;
  }, wsDir);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('creates, edits, renames, and deletes files on the host filesystem', async () => {
  await page.evaluate((id) => window.sero.editor.createFile(id, 'notes.txt'), ws.id);
  await page.evaluate((id) => window.sero.editor.writeFile(id, 'notes.txt', 'hello host'), ws.id);
  expect(fs.readFileSync(path.join(wsDir, 'notes.txt'), 'utf8')).toBe('hello host');

  const renamed = await page.evaluate((id) => window.sero.editor.rename(id, 'notes.txt', 'renamed.txt'), ws.id);
  expect(renamed).toBe(true);
  expect(fs.existsSync(path.join(wsDir, 'renamed.txt'))).toBe(true);

  const deleted = await page.evaluate((id) => window.sero.editor.delete(id, 'renamed.txt'), ws.id);
  expect(deleted).toBe(true);
  expect(fs.existsSync(path.join(wsDir, 'renamed.txt'))).toBe(false);
});

test('runs host exec commands at the workspace cwd', async () => {
  const pwd = await page.evaluate((id) => window.sero.editor.exec(id, 'pwd'), ws.id);
  expect(pwd.exitCode).toBe(0);
  expect(fs.realpathSync(pwd.stdout.trim())).toBe(fs.realpathSync(wsDir));

  const git = await page.evaluate((id) => window.sero.editor.exec(id, 'git status --short'), ws.id);
  expect(typeof git.stdout).toBe('string');
});

test('creates and disposes a host terminal', async () => {
  const terminalId = `host-term-${Date.now()}`;
  const replay = await page.evaluate(async ({ workspaceId, terminalId }) => {
    await window.sero.terminal.create(workspaceId, terminalId, 80, 24);
    await window.sero.terminal.write(terminalId, 'pwd\n');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const output = await window.sero.terminal.replay(terminalId);
    await window.sero.terminal.dispose(terminalId);
    return output;
  }, { workspaceId: ws.id, terminalId });

  expect(replay).toContain(path.basename(wsDir));
});

test.skip('host LSP, dev-server preview, and browser-pack install flows are deferred until deterministic UI hooks exist', async () => {
  // Avoid installing toolchains or browser packs during Phase 2 workflow smoke.
});
