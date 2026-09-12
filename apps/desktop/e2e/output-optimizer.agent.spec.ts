/**
 * Output optimizer fork journey.
 *
 * Project: agent. Runs one real model turn that forces a bash tool call, then
 * forks the session and verifies the fork inherits the complete-capture
 * reference and the plugin accounting entry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
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
  seedWorkflowProfile,
  toolEnds,
  waitForShell,
  type TempSeroHome,
} from './helpers';

const gate = requireLlmReady();
test.skip(gate.skip, gate.reason ?? 'Agent tests are disabled.');
test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

function llmConfig() {
  const config = getLlmConfig();
  if (!config) throw new Error('Output optimizer agent test reached without LLM config.');
  return config;
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  seedWorkflowProfile(home, { name: 'Optimizer Fork E2E' });

  ({ app, page } = await launchWorkflowApp({
    home,
    profile: false,
    runtime: 'host',
    withoutEnv: getLlmCredentialEnvKeys(),
    env: {
      SERO_HOST_FIRST: '1',
      ...getLlmLaunchEnv(),
    },
  }));
  await waitForShell(page);

  // The profile home is resolved by the host, so enable the plugin there before
  // the first session is created.
  const seroHome = await app.evaluate(() => process.env.SERO_HOME ?? null);
  if (!seroHome) throw new Error('The app did not resolve SERO_HOME.');
  const configDir = path.join(seroHome, 'state', 'output-optimizer');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    `${JSON.stringify({ version: 1, enabled: true, notices: true }, null, 2)}\n`,
    'utf8',
  );
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test('a fork inherits the complete capture and accounting entry', async () => {
  const workspacePath = createWorkspaceDir(home.path, 'optimizer fork workspace');
  const fixture = await createOpenAgentSession(page, workspacePath, 'optimizer fork');
  const configured = await configureAgentModel(page, fixture.session.id, llmConfig());
  if (!configured.configured) {
    test.skip(true, configured.reason ?? 'Configured e2e LLM model unavailable.');
    return;
  }

  // High thinking mode, as requested for this journey.
  await page.evaluate(async (sessionId: string) => {
    const state = await window.sero.agent.getModelState(sessionId);
    if (state?.availableThinkingLevels.includes('high')) {
      await window.sero.agent.setThinkingLevel(sessionId, 'high');
    }
  }, fixture.session.id);

  const tools = await disableAllToolsExcept(
    page,
    fixture.session.id,
    ['bash'],
    'You are an e2e test agent. Call the bash tool exactly once with {"command":"seq 1 40"} before answering. Then answer with only the number of lines printed.',
  );
  if (!tools.includes('bash')) {
    test.skip(true, 'The bash tool is not available in this agent session.');
    return;
  }

  const turn = await promptAndCollectEvents(
    page,
    fixture.session.id,
    'Call bash with command "seq 1 40". Then answer with only the number of lines printed.',
    180_000,
  );

  const ends = toolEnds(turn.events, 'bash');
  const succeeded = ends.find((event) => event.isError === false);
  expect(succeeded, `bash did not succeed. Events: ${turn.events.map((event) => event.type).join(', ')}`).toBeTruthy();

  const details = (succeeded?.details ?? {}) as {
    capture?: { captureId?: string; complete?: boolean };
    optimization?: { measured?: boolean; inputBytes?: number };
  };
  expect(details.capture?.complete).toBe(true);
  expect(details.optimization?.measured).toBe(true);
  const captureId = details.capture?.captureId;
  expect(captureId).toBeTruthy();

  const fork = await page.evaluate(async (sessionId: string) => window.sero.agent.forkSession(sessionId), fixture.session.id);
  const forkHistory = await page.evaluate(
    async ({ sessionId, sessionPath, workspaceId }) => window.sero.agent.open(sessionId, sessionPath, workspaceId),
    { sessionId: fork.id, sessionPath: fork.path, workspaceId: fixture.workspace.id },
  );

  const toolMessages = forkHistory.messages.filter(
    (message): message is Extract<typeof message, { type: 'tool' }> => message.type === 'tool',
  );
  const retained = toolMessages.find(
    (message) => (message.details as { capture?: { captureId?: string } } | null)?.capture?.captureId === captureId,
  );
  expect(retained, `fork history did not retain capture ${captureId}. Tool messages: ${toolMessages.length}`).toBeTruthy();
  expect((retained?.details as { optimization?: { measured?: boolean } }).optimization?.measured).toBe(true);
});
