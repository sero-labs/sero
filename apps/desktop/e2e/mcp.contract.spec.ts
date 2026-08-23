import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import type { SeroAppManifest } from '../src/types/ipc';

const serverName = 'e2e-fixture';
const serverPath = path.resolve(__dirname, 'fixtures/test-mcp-server/server.mjs');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
  const parent = path.join(home.path, 'mcp-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const workspace = await page.evaluate(
    ({ name, parentPath }) => window.sero.workspace.create(name, parentPath),
    { name: 'MCP Contract Workspace', parentPath: parent },
  );
  workspaceId = workspace.id;
});

test.afterAll(async () => {
  await closeSeroApp(app);
  home.cleanup();
});

function invokeMcp(toolName: 'mcp' | 'mcp_manager', params: Record<string, unknown>) {
  return page.evaluate(
    ({ workspaceId: id, toolName: name, params: toolParams }) => window.sero.appAgent.invokeTool(
      'mcp',
      id,
      name,
      toolParams,
    ),
    { workspaceId, toolName, params },
  );
}

function fixtureConfig() {
  return JSON.stringify({
    mcpServers: {
      [serverName]: {
        enabled: true,
        transport: 'stdio',
        command: process.execPath,
        args: [serverPath],
        exposeResources: true,
        lifecycle: 'lazy',
      },
    },
  });
}

test.describe.serial('MCP app and proxy contracts', () => {
  test('surfaces MCP manifest metadata and bootstraps isolated state', async () => {
    const manifest = await page.evaluate(() => window.sero.apps.discover()
      .then((apps: SeroAppManifest[]) => apps.find((candidate: SeroAppManifest) => candidate.id === 'mcp') ?? null));
    expect(manifest).toEqual(expect.objectContaining({
      id: 'mcp',
      scope: 'global',
      plugin: expect.objectContaining({
        requiredHostCapabilities: expect.arrayContaining(['appAgent.invokeTool', 'tool.cli']),
        bridgeTools: expect.arrayContaining(['mcp']),
      }),
    }));

    const bootstrap = await invokeMcp('mcp_manager', { action: 'bootstrap' });
    expect(bootstrap.text).toContain('Initialized MCP app state');
    expect(bootstrap.details).toEqual(expect.objectContaining({
      configPath: path.join(home.path, 'apps', 'mcp', 'config.json'),
      statePath: path.join(home.path, 'apps', 'mcp', 'state.json'),
      serverCount: 0,
    }));

    const status = await invokeMcp('mcp', { action: 'status' });
    expect(status.text).toContain('MCP status: 0 server(s) configured');
  });

  test('excludes the bridged MCP proxy from a new session agent tool list', async () => {
    const session = await page.evaluate(async (id) => {
      const created = await window.sero.sessions.create(id);
      await window.sero.agent.open(created.id, created.path, id);
      return created;
    }, workspaceId);
    const context = await page.evaluate((id) => window.sero.agent.getContext(id), session.id);
    const manifest = await page.evaluate(() => window.sero.apps.discover()
      .then((apps: SeroAppManifest[]) => apps.find((candidate: SeroAppManifest) => candidate.id === 'mcp') ?? null));
    const settingsPath = path.join(home.path, 'agent', 'settings.json');
    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { packages?: unknown[] }
      : null;
    const diagnostics = JSON.stringify({
      manifest,
      packages: settings?.packages ?? `missing ${settingsPath}`,
      tools: context?.tools.map((tool) => tool.name),
    }, null, 2);

    const toolNames = context?.tools.map((tool) => tool.name);
    expect(toolNames, diagnostics).toEqual(expect.arrayContaining([
      'sero-cli',
      'mcp_manager',
    ]));
    expect(toolNames, diagnostics).not.toContain('mcp');
  });

  test('saves and reads raw MCP config for a local stdio fixture', async () => {
    const saved = await invokeMcp('mcp_manager', { action: 'save_raw_config', rawConfig: fixtureConfig() });
    expect(saved.text).toContain('Saved MCP config with 1 configured server');

    const raw = await invokeMcp('mcp_manager', { action: 'get_raw_config' });
    expect(raw.text).toContain(serverName);
    const rawConfig = typeof raw.details?.rawConfig === 'string' ? raw.details.rawConfig : raw.text;
    const persisted = JSON.parse(rawConfig) as { mcpServers: Record<string, { args?: string[] }> };
    expect(persisted.mcpServers[serverName]?.args?.[0]).toBe(serverPath);

    const listed = await invokeMcp('mcp', { action: 'list' });
    expect(listed.text).toContain(`- ${serverName}`);
    expect(listed.details).toEqual(expect.objectContaining({ serverCount: 1 }));

    const status = await invokeMcp('mcp', { action: 'status' });
    expect(status.text).toContain('MCP status: 1 server(s) configured');
  });

  test('connects and proxies local MCP tools and resources', async () => {
    const connected = await invokeMcp('mcp', { action: 'connect', serverName });
    expect(connected.text).toContain(serverName);
    expect(connected.text).toMatch(/connected|Connected/);

    const tools = await invokeMcp('mcp', { action: 'list_tools', serverName });
    expect(tools.text).toContain('- echo');
    expect(tools.details).toEqual(expect.objectContaining({
      tools: expect.arrayContaining([expect.objectContaining({ name: 'echo' })]),
    }));

    const described = await invokeMcp('mcp', { action: 'describe_tool', serverName, toolName: 'echo' });
    expect(described.text).toContain('Input schema:');
    expect(JSON.stringify(described.details.inputSchema)).toContain('message');

    const called = await invokeMcp('mcp', {
      action: 'call_tool',
      serverName,
      toolName: 'echo',
      toolArguments: { message: 'phase-3' },
    });
    expect(called.text).toContain('echo: phase-3');
    expect(called.isError).toBe(false);

    const resources = await invokeMcp('mcp', { action: 'list_resources', serverName });
    expect(resources.text).toContain('noise://test');

    const read = await invokeMcp('mcp', { action: 'read_resource', serverName, resourceUri: 'noise://test' });
    expect(read.text).toContain('deterministic noise fixture');
  });

  test('returns deterministic errors for missing MCP arguments', async () => {
    const missingQuery = await invokeMcp('mcp', { action: 'search' });
    expect(missingQuery.text).toContain('Error: Search query is required.');

    const missingServer = await invokeMcp('mcp', { action: 'list_tools' });
    expect(missingServer.text).toContain('Error: Server name is required.');

    const missingTool = await invokeMcp('mcp', { action: 'describe_tool', serverName });
    expect(missingTool.text).toContain('Error: Tool name is required.');
  });
});
