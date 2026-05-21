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

const releaseSmoke = process.env.SERO_E2E_HOST_RELEASE_SMOKE === '1';
const selectedRuntime = currentRuntimeFromEnv();
const platformSkipReason = runtimeSkipReason('host');
const hostFirstEnabled = process.env.SERO_HOST_FIRST === '1';

test.skip(!releaseSmoke, 'release host smoke requires SERO_E2E_HOST_RELEASE_SMOKE=1');
test.skip(
  selectedRuntime !== 'host' || platformSkipReason !== null || !hostFirstEnabled,
  platformSkipReason ?? 'release host smoke requires SERO_E2E_RUNTIME=host and SERO_HOST_FIRST=1',
);

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let ws: WorkspaceInfo;
let wsDir: string;
let devServerUrl: string | undefined;

interface DevServerStartResult {
  port: number;
  pid: number;
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    runtime: 'host',
    withoutEnv: ['SERO_BROWSER_PACK_BASE_URL'],
    env: { SERO_HOST_FIRST: '1', SERO_E2E_HOST_RELEASE_SMOKE: '1' },
  }));
  await waitForShell(page);
  wsDir = createWorkspaceDir(home.path, 'host release runtime workspace café', {
    'package.json': '{"scripts":{"dev":"node scripts/server.cjs"},"devDependencies":{}}\n',
    'src/index.ts': 'export const releaseSmoke = true;\n',
  });
  ws = await page.evaluate(async (folderPath) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Host Release Runtime Workspace');
    await window.sero.workspace.setRuntimeBackend(workspace.id, 'host');
    return workspace;
  }, wsDir);
});

test.afterAll(async () => {
  try {
    if (page && ws) {
      await page.evaluate((id) => window.sero.editor.exec(id, 'node scripts/stop-server.cjs'), ws.id).catch(() => undefined);
    }
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('host release smoke covers filesystem, exec, terminal, LSP, preview, and browser pack', async () => {
  await expectBrowserPackReady();
  await exerciseFileExecAndTerminal();
  await exerciseTypeScriptLsp();
  devServerUrl = await startDevServerPreview();
});

async function expectBrowserPackReady(): Promise<void> {
  const status = await page.evaluate(async () => {
    const before = await window.sero.workspace.getBrowserPackStatus();
    return before.state === 'ready' ? before : window.sero.workspace.ensureBrowserPack('host release smoke');
  });

  if (status.state !== 'ready') {
    throw new Error(`Browser Pack did not become ready: ${JSON.stringify(status)}`);
  }
  expect(status.artifactKey).toMatch(/^browser-/);
  expect(status.browsersPath).toBeTruthy();
}

async function exerciseFileExecAndTerminal(): Promise<void> {
  await page.evaluate((id) => window.sero.editor.createFile(id, 'release-notes.txt'), ws.id);
  await page.evaluate((id) => window.sero.editor.writeFile(id, 'release-notes.txt', 'hello host release'), ws.id);
  expect(fs.readFileSync(path.join(wsDir, 'release-notes.txt'), 'utf8')).toBe('hello host release');

  const cwd = await page.evaluate((id) => window.sero.editor.exec(id, 'node -e "console.log(process.cwd())"'), ws.id);
  expect(cwd.exitCode).toBe(0);
  expect(fs.realpathSync(cwd.stdout.trim())).toBe(fs.realpathSync(wsDir));

  const terminalId = `host-release-term-${Date.now()}`;
  const replay = await page.evaluate(async ({ workspaceId, terminalId }) => {
    await window.sero.terminal.create(workspaceId, terminalId, 80, 24);
    await window.sero.terminal.write(terminalId, 'pwd\n');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const output = await window.sero.terminal.replay(terminalId);
    await window.sero.terminal.dispose(terminalId);
    return output;
  }, { workspaceId: ws.id, terminalId });

  expect(replay).toContain(path.basename(wsDir));
}

async function exerciseTypeScriptLsp(): Promise<void> {
  const started = await page.evaluate((id) => window.sero.lsp.start(id, 'typescript'), ws.id);
  expect(started.language).toBe('typescript');
  expect(typeof started.capabilities).toBe('object');
  await expect.poll(
    () => page.evaluate((id) => window.sero.lsp.hasServer(id, 'typescript'), ws.id),
    { timeout: 5_000 },
  ).toBe(true);
}

async function startDevServerPreview(): Promise<string> {
  await page.evaluate((id) => window.sero.editor.createDir(id, 'scripts'), ws.id);
  await page.evaluate(({ id, content }) => window.sero.editor.writeFile(id, 'scripts/server.cjs', content), {
    id: ws.id,
    content: serverScript(),
  });
  await page.evaluate(({ id, content }) => window.sero.editor.writeFile(id, 'scripts/start-server.cjs', content), {
    id: ws.id,
    content: startServerScript(),
  });
  await page.evaluate(({ id, content }) => window.sero.editor.writeFile(id, 'scripts/stop-server.cjs', content), {
    id: ws.id,
    content: stopServerScript(),
  });

  const result = await page.evaluate((id) => window.sero.editor.exec(id, 'node scripts/start-server.cjs'), ws.id);
  expect(result.exitCode).toBe(0);
  const started = JSON.parse(result.stdout.trim()) as DevServerStartResult;
  expect(started.port).toBeGreaterThan(0);
  expect(started.pid).toBeGreaterThan(0);

  const url = `http://127.0.0.1:${started.port}`;
  await expect.poll(async () => {
    const response = await fetch(url);
    return response.text();
  }, { timeout: 10_000 }).toContain('sero host release smoke');

  return url;
}

function serverScript(): string {
  return `const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>Sero smoke</title><main>sero host release smoke</main>');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP address');
  fs.writeFileSync('.dev-server.json', JSON.stringify({ port: address.port, pid: process.pid }));
});
setInterval(() => undefined, 1000);
`;
}

function startServerScript(): string {
  return `const fs = require('node:fs');
const { spawn } = require('node:child_process');
try { fs.unlinkSync('.dev-server.json'); } catch {}
const child = spawn(process.execPath, ['scripts/server.cjs'], { detached: true, stdio: 'ignore' });
child.unref();
const deadline = Date.now() + 10000;
while (!fs.existsSync('.dev-server.json')) {
  if (Date.now() > deadline) throw new Error('Timed out waiting for dev server');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}
process.stdout.write(fs.readFileSync('.dev-server.json', 'utf8'));
`;
}

function stopServerScript(): string {
  return `const fs = require('node:fs');
if (!fs.existsSync('.dev-server.json')) process.exit(0);
const info = JSON.parse(fs.readFileSync('.dev-server.json', 'utf8'));
try { process.kill(info.pid); } catch {}
try { fs.unlinkSync('.dev-server.json'); } catch {}
`;
}
