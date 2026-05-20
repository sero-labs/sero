import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import {
  assistantTextFromEvents,
  closeApp,
  configureAgentModel,
  createOpenAgentSession,
  createTempSeroHome,
  createWorkspaceDir,
  disableAllToolsExcept,
  getLlmConfig,
  getLlmCredentialEnvKeys,
  getLlmLaunchEnv,
  launchWorkflowApp,
  promptAndCollectEvents,
  requireLlmReady,
  toolEnds,
  toolStarts,
  type TempSeroHome,
  waitForShell,
} from './helpers';

const gate = requireLlmReady();
test.skip(gate.skip, gate.reason ?? 'Agent realism tests are disabled.');
test.describe.configure({ mode: 'serial' });

const serverName = 'e2e-fixture';
const serverPath = path.resolve(__dirname, 'fixtures/test-mcp-server/server.mjs');

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

function llmConfig() {
  const config = getLlmConfig();
  if (!config) throw new Error('Agent realism test reached without LLM config.');
  return config;
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

function skipOrFailInCi(shouldSkip: boolean, reason: string): void {
  if (!shouldSkip) return;
  if (process.env.CI === 'true') throw new Error(reason);
  test.skip(true, reason);
}

async function configureOrSkip(sessionId: string): Promise<void> {
  const configured = await configureAgentModel(page, sessionId, llmConfig());
  skipOrFailInCi(!configured.configured, configured.reason ?? 'Configured e2e LLM model unavailable.');
}

async function invokeMcp(workspaceId: string, toolName: 'mcp' | 'mcp_manager', params: Record<string, unknown>) {
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

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    runtime: 'host',
    withoutEnv: getLlmCredentialEnvKeys(),
    env: {
      SERO_HOST_FIRST: '1',
      ...getLlmLaunchEnv(),
    },
  }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('uses the MCP bridge tool to call the local echo fixture', async () => {
  const workspacePath = createWorkspaceDir(home.path, 'agent mcp workspace');
  const { workspace, session } = await createOpenAgentSession(page, workspacePath, 'Agent MCP Workspace');
  await configureOrSkip(session.id);

  const saved = await invokeMcp(workspace.id, 'mcp_manager', {
    action: 'save_raw_config',
    rawConfig: fixtureConfig(),
  });
  expect(saved.text).toContain('Saved MCP config with 1 configured server');

  const connected = await invokeMcp(workspace.id, 'mcp', { action: 'connect', serverName });
  expect(connected.text).toMatch(/connected|Connected/);

  const cliCommand = `mcp call ${serverName} echo '{"message":"phase-4-agent"}'`;
  const tools = await disableAllToolsExcept(
    page,
    session.id,
    ['sero-cli'],
    `You are an e2e test agent. You must use the sero-cli tool exactly once with command ${JSON.stringify(cliCommand)} before answering. Keep final answers concise.`,
  );
  skipOrFailInCi(!tools.includes('sero-cli'), 'Sero CLI tool is not available in this agent session.');

  const turn = await promptAndCollectEvents(
    page,
    session.id,
    `Use sero-cli to run exactly this command: ${cliCommand}. Then answer with the exact echoed text.`,
  );

  expect(toolStarts(turn.events, 'sero-cli')).not.toHaveLength(0);
  expect(toolEnds(turn.events, 'sero-cli').some((event) => {
    return event.isError === false && event.details?.exitCode === 0;
  })).toBe(true);
  expect(assistantTextFromEvents(turn.events)).toContain('phase-4-agent');
});
