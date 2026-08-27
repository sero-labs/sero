/**
 * Boots a real Pi AgentSession against the local provider fixture.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import {
  seedFixtureAgentDir,
  startProviderFixture,
  type FixtureSettings,
  type ProviderFixture,
} from './fixtures/provider-fixture';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  type ProviderScenario,
} from './fixtures/provider-scenarios';

export interface ScenarioRun {
  session: AgentSession;
  fixture: ProviderFixture;
}

export async function openScenarioSession(
  scenario: ProviderScenario,
  cleanups: Array<() => Promise<void>>,
  overrides?: Partial<FixtureSettings>,
): Promise<ScenarioRun> {
  const root = await mkdtemp(join(tmpdir(), 'pi-parity-'));
  const cwd = join(root, 'workspace');
  const agentDir = join(root, 'agent');
  await mkdir(cwd, { recursive: true });

  const fixture = await startProviderFixture(scenario);
  await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url, ...overrides });

  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    refreshOnCreate: false,
  });
  const model = runtime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
  if (!model) throw new Error('Fixture model is not registered');

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model,
    tools: ['write'],
  });

  cleanups.push(async () => {
    session.dispose();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  });

  return { session, fixture };
}
