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
const platformSkipReason = runtimeSkipReason('docker');

test.skip(
  selectedRuntime !== 'docker' || platformSkipReason !== null,
  platformSkipReason ?? 'runtime-docker.workflow.spec.ts requires SERO_E2E_RUNTIME=docker',
);

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let ws: WorkspaceInfo;
let wsDir: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home, runtime: 'docker' }));
  await waitForShell(page);
  wsDir = createWorkspaceDir(home.path, 'docker runtime workspace', {
    'fixture.txt': 'docker-live-mount-sentinel\n',
  });
  ws = await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Docker Runtime Workspace');
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'docker');
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

test('selects the docker runtime backend for the workspace', async () => {
  const config = await page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), ws.id);
  expect(config.backend).toBe('docker');
});

test('uses /workspace as a live mount between host and docker runtime', async () => {
  const content = await page.evaluate((id) => window.sero.editor.readFile(id, 'fixture.txt'), ws.id);
  expect(content).toContain('docker-live-mount-sentinel');

  await page.evaluate((id) => window.sero.editor.writeFile(id, 'container-write.txt', 'written through docker'), ws.id);
  expect(fs.readFileSync(path.join(wsDir, 'container-write.txt'), 'utf8')).toBe('written through docker');
});

test('executes node and git inside the docker runtime', async () => {
  const node = await page.evaluate((id) => window.sero.editor.exec(id, 'node --version'), ws.id);
  expect(node.exitCode).toBe(0);
  expect(node.stdout).toMatch(/^v\d+\.\d+\.\d+/);

  const git = await page.evaluate((id) => window.sero.editor.exec(id, 'git --version'), ws.id);
  expect(git.exitCode).toBe(0);
  expect(git.stdout).toContain('git version');
});

test('opens a docker-backed terminal in /workspace', async () => {
  const terminalId = `docker-term-${Date.now()}`;
  await page.evaluate(async ({ workspaceId, terminalId }) => {
    await window.sero.terminal.create(workspaceId, terminalId, 80, 24);
    await window.sero.terminal.write(terminalId, 'pwd\n');
  }, { workspaceId: ws.id, terminalId });

  try {
    await expect.poll(
      () => page.evaluate((id) => window.sero.terminal.replay(id), terminalId),
      { timeout: 10_000 },
    ).toContain('/workspace');
  } finally {
    await page.evaluate((id) => window.sero.terminal.dispose(id), terminalId).catch(() => undefined);
  }
});
