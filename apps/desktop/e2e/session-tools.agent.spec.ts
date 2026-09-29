/**
 * A real model picks each moved tool from its command line (spec
 * `session-tool-surface`, design D8).
 *
 * The contract spec proves every tool a session is shown can be called. This
 * one proves a model finds the right command from a plain request, now that
 * the tools sit behind `sero-cli`. It costs a few cents, so it runs only when
 * `SERO_E2E_LLM_MODE` is `cheap` or `full`, and it uses the model that mode
 * names. Set `SERO_E2E_LLM_PROVIDER` and `SERO_E2E_LLM_MODEL` to pick another.
 *
 * `SERO_E2E_RUNTIME=apple-container` also checks the hidden browser, which
 * only a container workspace has.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  configureAgentModel,
  createTempSeroHome,
  createWorkspaceDir,
  currentRuntimeFromEnv,
  getLlmConfig,
  getLlmCredentialEnvKeys,
  getLlmLaunchEnv,
  launchWorkflowApp,
  requireLlmReady,
  waitForShell,
  type TempSeroHome,
} from './helpers';

const gate = requireLlmReady();
test.skip(gate.skip, gate.reason ?? 'Agent tests are disabled.');
test.describe.configure({ mode: 'serial' });

const RUNTIME = currentRuntimeFromEnv() ?? 'host';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let workspaceId = '';

function llmConfig() {
  const config = getLlmConfig();
  if (!config) throw new Error('The agent spec ran without an LLM config.');
  return config;
}

/**
 * Asks one plain question in a fresh chat and stops the turn as soon as the model starts the call
 * that matches. What the check needs is which command the model picks, not how long it then talks.
 */
async function ask(request: string, target: { tool: string; pattern: string }): Promise<{ matched: boolean; calls: string[] }> {
  const session = await page.evaluate(async ({ id }) => {
    const created = await window.sero.sessions.create(id);
    await window.sero.agent.open(created.id, created.path, id);
    return created;
  }, { id: workspaceId });
  const configured = await configureAgentModel(page, session.id, llmConfig());
  if (!configured.configured) throw new Error(configured.reason ?? 'The e2e model is not available.');
  // Choosing a command needs no long reasoning. Use the lowest level the model has.
  await page.evaluate(async (id) => {
    const state = await window.sero.agent.getModelState(id);
    const lowest = (['off', 'minimal', 'low'] as const).find((level) => state?.availableThinkingLevels.includes(level));
    if (lowest && lowest !== state?.thinkingLevel) await window.sero.agent.setThinkingLevel(id, lowest);
  }, session.id);

  return page.evaluate(({ id, text, tool, pattern, timeoutMs }) => new Promise<{ matched: boolean; calls: string[] }>((resolve) => {
    const calls: string[] = [];
    const seen: Record<string, number> = {};
    const matcher = new RegExp(pattern);
    let unsubscribe: (() => void) | undefined;
    const finish = (matched: boolean) => {
      window.clearTimeout(timer);
      unsubscribe?.();
      if (matched) void window.sero.agent.abort(id);
      resolve({ matched, calls: [...calls, `events: ${JSON.stringify(seen)}`] });
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    unsubscribe = window.sero.agent.onEvent((event) => {
      if (event.sessionId !== id) return;
      seen[event.type] = (seen[event.type] ?? 0) + 1;
      if (event.type === 'tool_start') {
        const call = JSON.stringify(event.tool);
        calls.push(call.slice(0, 300));
        if (event.tool.toolName === tool && matcher.test(call)) finish(true);
      }
      if (event.type === 'agent_end' || event.type === 'error') finish(false);
    });
    window.sero.agent.prompt(id, text, undefined, `e2e-${Date.now()}`).catch(() => finish(false));
  }), { id: session.id, text: request, tool: target.tool, pattern: target.pattern, timeoutMs: 240_000 });
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  // Where the app keeps managed profiles. A profile anywhere else is moved and its seeds are lost.
  const profilePath = path.join(home.path, '.sero-ui', 'profiles', 'workflow-test');
  // A profile with no memory makes the model start a memory questionnaire that waits for a person.
  const memoryRoot = path.join(profilePath, 'workspaces', 'global');
  fs.mkdirSync(memoryRoot, { recursive: true });
  fs.writeFileSync(path.join(memoryRoot, 'IDENTITY.md'), '# Identity\n\n- **Name:** Sero\n');
  fs.writeFileSync(path.join(memoryRoot, 'USER.md'), '# User\n\n- **Role:** Developer\n');
  ({ app, page } = await launchWorkflowApp({
    home,
    profile: { profilePath },
    runtime: RUNTIME,
    withoutEnv: getLlmCredentialEnvKeys(),
    env: { ...getLlmLaunchEnv() },
  }));
  await waitForShell(page);
  const workspace = await page.evaluate(
    ({ folderPath }) => window.sero.workspace.addFolder(folderPath, 'Session Tools Agent'),
    { folderPath: createWorkspaceDir(home.path, 'session tools agent workspace') },
  );
  workspaceId = workspace.id;
  if (RUNTIME !== 'host') {
    await page.evaluate(({ id, runtime }) => window.sero.workspace.setRuntimeBackend(id, runtime), { id: workspaceId, runtime: RUNTIME });
  }
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('an MCP config request goes to the MCP command', async () => {
  test.setTimeout(360_000);
  const { matched, calls } = await ask('Show me the raw MCP server configuration Sero has right now.', { tool: 'sero-cli', pattern: 'command":"(sero )?mcp(_manager)? ' });
  expect(matched, `no MCP command in:\n${calls.join('\n')}`).toBe(true);
});

test('a Design Library settings request goes to the Design Library settings command', async () => {
  test.setTimeout(360_000);
  const { matched, calls } = await ask('In the Design Library, set the search text of the library view to "probe".', { tool: 'sero-cli', pattern: 'design_library_settings' });
  expect(matched, `no Design Library command in:\n${calls.join('\n')}`).toBe(true);
});

test('a hidden browser request goes to the browser command', async () => {
  test.skip(RUNTIME === 'host', 'Only a container workspace has the hidden browser.');
  test.setTimeout(360_000);
  const { matched, calls } = await ask('Open about:blank in a hidden headless browser to check it loads, then close it. Do not use the visible Browser panel.', { tool: 'sero-cli', pattern: 'automation_browser' });
  expect(matched, `no browser command in:\n${calls.join('\n')}`).toBe(true);
});

test('a Pi docs question reads the pi-docs skill', async () => {
  test.setTimeout(360_000);
  const { matched, calls } = await ask('Where are the Pi coding agent documentation files, and what does its main README say it is? Read it before you answer.', { tool: 'read', pattern: 'pi-docs' });
  expect(matched, `pi-docs skill was not read in:\n${calls.join('\n')}`).toBe(true);
});
