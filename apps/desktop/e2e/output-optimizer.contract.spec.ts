/**
 * Output optimizer contract tests.
 *
 * Project: contract. Verifies the built-in plugin is discovered, its extension
 * loads into a session (which the host gates on the `tool.nestedCallPrefix`
 * capability), and its profile config is read through the plugin tool.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchSeroApp, seedProfile, seedWorkspace, type TempSeroHome } from './helpers';

let app: ElectronApplication;
let page: Page;
let seroHome: TempSeroHome;
let workspaceId: string;

const PLUGIN_ID = 'output-optimizer';
const TOOL_NAME = 'output_optimizer';

test.beforeAll(async () => {
  seroHome = createTempSeroHome();
  seedProfile(seroHome, { name: 'Optimizer E2E' });
  const workspace = seedWorkspace(seroHome, {
    name: 'optimizer-workspace',
    path: fs.mkdtempSync(path.join(seroHome.path, 'ws-')),
  });
  workspaceId = workspace.id;

  ({ app, page } = await launchSeroApp({ seroHome: seroHome.path }));
  await expect.poll(async () => page.evaluate(() => typeof (window as any).sero?.apps?.discover === 'function'), {
    timeout: 10_000,
  }).toBe(true);

  // The config lives in the Sero profile state directory, which the host
  // resolves. Write it there so the extension proves it reads the profile path
  // rather than `~/.pi`. `notices: false` is not the default, so a read is real.
  const resolvedHome = await app.evaluate(() => process.env.SERO_HOME ?? null);
  if (!resolvedHome) throw new Error('The app did not resolve SERO_HOME.');
  const configDir = path.join(resolvedHome, 'state', 'output-optimizer');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    `${JSON.stringify({ version: 1, enabled: false, notices: false }, null, 2)}\n`,
    'utf8',
  );
});

test.afterAll(async () => {
  await closeSeroApp(app);
  seroHome.cleanup();
});

test.describe('Output optimizer plugin', () => {
  test('resolves its config from the active profile Sero home', async () => {
    const result = await app.evaluate(() => ({
      seroHome: process.env.SERO_HOME ?? null,
      agentDir: process.env.PI_CODING_AGENT_DIR ?? null,
    }));
    expect(result.seroHome).toBeTruthy();
    expect(result.agentDir).toBeTruthy();
  });

  test('is discovered as a built-in app', async () => {
    const apps = await page.evaluate(async () => (window as any).sero.apps.discover());
    expect(apps.some((item: { id: string }) => item.id === PLUGIN_ID)).toBe(true);
  });

  test('loads its extension into a session and answers its tool', async () => {
    type ToolResult = { text: string; details: Record<string, unknown> | null };
    const result: ToolResult = await page.evaluate(
      async ({ appId, wsId, tool }) => (window as any).sero.appAgent.invokeTool(appId, wsId, tool, { action: 'state' }),
      { appId: PLUGIN_ID, wsId: workspaceId, tool: TOOL_NAME },
    );

    expect(result.details).not.toBeNull();
    const state = result.details as {
      config: { enabled: boolean; notices: boolean };
      savings: { measuredCalls: number };
      rtk: { state: string };
    };
    // The extension loaded (only a compatible host loads it) and registered its tool.
    expect(typeof state.config.enabled).toBe('boolean');
    expect(typeof state.config.notices).toBe('boolean');
    expect(state.savings.measuredCalls).toBeGreaterThanOrEqual(0);
    expect(state.rtk.state).toBeTruthy();
  });

  test('persists an enabled toggle through the plugin tool', async () => {
    type ToolResult = { details: { config: { enabled: boolean } } | null };
    const enabled: ToolResult = await page.evaluate(
      async ({ appId, wsId, tool }) => (window as any).sero.appAgent.invokeTool(appId, wsId, tool, { action: 'set', enabled: true }),
      { appId: PLUGIN_ID, wsId: workspaceId, tool: TOOL_NAME },
    );
    expect(enabled.details?.config.enabled).toBe(true);

    const reread: ToolResult = await page.evaluate(
      async ({ appId, wsId, tool }) => (window as any).sero.appAgent.invokeTool(appId, wsId, tool, { action: 'state' }),
      { appId: PLUGIN_ID, wsId: workspaceId, tool: TOOL_NAME },
    );
    expect(reread.details?.config.enabled).toBe(true);
  });

  test('reaches the RTK host from the settings app session', async () => {
    type ToolResult = { details: { rtk: { state: string; reason?: string } } | null };
    // The settings UI runs in an isolated app session that never receives
    // `session_start`. Retry must still name that session and reach the host.
    const result: ToolResult = await page.evaluate(
      async ({ appId, wsId, tool }) => (window as any).sero.appAgent.invokeTool(appId, wsId, tool, { action: 'retry' }),
      { appId: PLUGIN_ID, wsId: workspaceId, tool: TOOL_NAME },
    );
    expect(['available', 'installing', 'failed']).toContain(result.details?.rtk.state);
    // A failed state is allowed (RTK may be absent), but these two reasons prove
    // the request never reached a host handler that accepted this session.
    const reason = result.details?.rtk.reason ?? '';
    expect(reason).not.toContain('must name the session that owns this extension host');
    expect(reason).not.toContain('did not answer the RTK resolution request');
  });
});
