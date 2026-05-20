import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  assistantTextFromEvents,
  chooseAlternateAvailableModel,
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

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

function llmConfig() {
  const config = getLlmConfig();
  if (!config) throw new Error('Agent realism test reached without LLM config.');
  return config;
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

async function openConfiguredSession(name: string, files: Record<string, string> = {}) {
  const workspacePath = createWorkspaceDir(home.path, name, files);
  const fixture = await createOpenAgentSession(page, workspacePath, name);
  await configureOrSkip(fixture.session.id);
  return fixture;
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

test('answers a basic arithmetic prompt through a real model', async () => {
  const { session } = await openConfiguredSession('agent arithmetic');
  await disableAllToolsExcept(
    page,
    session.id,
    [],
    'You are an e2e test agent. Do not use tools. Keep answers concise.',
  );
  const turn = await promptAndCollectEvents(
    page,
    session.id,
    'Answer this arithmetic question with one short sentence: what is 2+2?',
  );

  expect(turn.events.map((event) => event.type)).toContain('agent_start');
  expect(turn.events.map((event) => event.type)).toContain('agent_end');
  expect(assistantTextFromEvents(turn.events)).toMatch(/\b4\b/);
});

test('uses the host read tool when the prompt requires a workspace file', async () => {
  const sentinel = 'SERO_PHASE4_READ_SENTINEL_7391';
  const { session } = await openConfiguredSession('agent read tool', {
    'fixture.txt': `${sentinel}\n`,
  });
  const tools = await disableAllToolsExcept(
    page,
    session.id,
    ['read'],
    'You are an e2e test agent. When the user asks for file contents, you must use the available read tool before answering.',
  );
  skipOrFailInCi(!tools.includes('read'), 'Host read tool is not available in this agent session.');

  const turn = await promptAndCollectEvents(
    page,
    session.id,
    'Use the read tool to read fixture.txt in the current workspace. Then answer with the exact sentinel from the file.',
  );

  expect(toolStarts(turn.events, 'read')).not.toHaveLength(0);
  expect(toolEnds(turn.events, 'read').some((event) => event.isError === false)).toBe(true);
  expect(assistantTextFromEvents(turn.events)).toContain(sentinel);
});

test('maintains context across a short multi-turn conversation', async () => {
  const { session } = await openConfiguredSession('agent multi turn');
  await disableAllToolsExcept(
    page,
    session.id,
    [],
    'You are an e2e test agent. Do not use tools. Keep answers concise.',
  );

  await promptAndCollectEvents(page, session.id, 'Remember this nonce for the next turn: purple-otter-41. Reply only OK.');
  const second = await promptAndCollectEvents(page, session.id, 'What nonce did I ask you to remember? Reply with only the nonce.');

  expect(assistantTextFromEvents(second.events).toLowerCase()).toContain('purple-otter-41');
});

test('switches model mid-conversation without losing session context', async () => {
  const { session } = await openConfiguredSession('agent model switch');
  await disableAllToolsExcept(
    page,
    session.id,
    [],
    'You are an e2e test agent. Do not use tools. Keep answers concise.',
  );
  const config = llmConfig();

  await promptAndCollectEvents(page, session.id, 'Remember project code name silver-kite-29. Reply only OK.');
  if (!config.alternateModelId) {
    test.skip(true, 'Set SERO_E2E_LLM_ALT_MODEL to run explicit model-switch coverage.');
    return;
  }
  const alternate = await chooseAlternateAvailableModel(
    page,
    session.id,
    config.provider,
    config.modelId,
    config.alternateModelId,
  );
  if (!alternate) {
    skipOrFailInCi(true, `Configured alternate model ${config.provider}/${config.alternateModelId} is not available.`);
    return;
  }

  await page.evaluate(
    ({ sessionId, provider, modelId }) => window.sero.agent.setModel(sessionId, provider, modelId),
    { sessionId: session.id, provider: alternate.provider, modelId: alternate.modelId },
  );
  const afterSwitch = await promptAndCollectEvents(
    page,
    session.id,
    'What project code name did I ask you to remember? Reply with only the code name.',
  );

  expect(assistantTextFromEvents(afterSwitch.events).toLowerCase()).toContain('silver-kite-29');
});
