import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import {
  fauxAssistantMessage,
  fauxProvider,
} from '@earendil-works/pi-ai/providers/faux';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createIsolatedCompletionService } from '../isolated-completion';

async function createSession(
  cwd: string,
  agentDir: string,
  modelRuntime: ModelRuntime,
  extensionFactory: ExtensionFactory,
): Promise<AgentSession> {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    extensionFactories: [extensionFactory],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    noTools: 'all',
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory(),
  });
  return session;
}

describe('shared custom provider propagation', () => {
  it('uses one provider implementation in main, app, subagent, and isolated sessions', async () => {
    const agentDir = await mkdtemp(path.join(tmpdir(), 'sero-provider-propagation-'));
    const faux = fauxProvider({
      provider: 'shared-faux',
      models: [{ id: 'shared-model', name: 'Shared Model', reasoning: true }],
    });
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    let extensionLoads = 0;
    const observedRequests: Array<{
      apiKey: unknown;
      baseUrl: unknown;
      headers: unknown;
    }> = [];
    const extensionFactory: ExtensionFactory = (pi) => {
      extensionLoads += 1;
      pi.registerProvider('shared-faux', {
        api: faux.api,
        apiKey: 'shared-key',
        baseUrl: 'https://shared-faux.test/v1',
        headers: { 'x-shared-provider': 'yes' },
        streamSimple: faux.provider.streamSimple,
        models: faux.models.map((model) => ({
          id: model.id,
          name: model.name,
          reasoning: model.reasoning,
          input: model.input,
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        })),
      });
    };
    const sessions: AgentSession[] = [];

    try {
      for (const role of ['main', 'app', 'subagent']) {
        sessions.push(await createSession(
          path.join(agentDir, role),
          agentDir,
          runtime,
          extensionFactory,
        ));
      }
      const model = runtime.getModel('shared-faux', 'shared-model');
      if (!model) throw new Error('Shared faux model was not registered.');
      for (const session of sessions) await session.setModel(model);

      faux.setResponses(
        ['main', 'app', 'subagent', 'isolated'].map((response) => (
          (context, options, _state, requestModel) => {
            observedRequests.push({
              apiKey: options?.apiKey,
              baseUrl: requestModel.baseUrl,
              headers: options?.headers,
            });
            return fauxAssistantMessage(response);
          }
        )),
      );

      await Promise.all(sessions.map((session, index) => session.prompt(`request-${index}`)));
      const isolated = createIsolatedCompletionService({
        agentDir,
        modelRuntime: runtime,
      });
      await expect(isolated({
        cwd: agentDir,
        model,
        prompt: 'isolated request',
        thinkingLevel: 'low',
      })).resolves.toBe('isolated');

      expect(sessions.every((session) => session.modelRuntime === runtime)).toBe(true);
      expect(sessions.map((session) => session.messages.length)).toEqual([2, 2, 2]);
      expect(sessions.every((session) => session.getAllTools().length === 0)).toBe(true);
      expect(extensionLoads).toBe(3);
      expect(observedRequests).toHaveLength(4);
      expect(observedRequests).toEqual(observedRequests.map(() => ({
        apiKey: 'shared-key',
        baseUrl: 'https://shared-faux.test/v1',
        headers: { 'x-shared-provider': 'yes' },
      })));

      await sessions[0].reload();
      expect(runtime.getModel('shared-faux', 'shared-model')).toBeDefined();
      sessions[0].dispose();
      expect(runtime.getModel('shared-faux', 'shared-model')).toBeDefined();

      new ModelRegistry(runtime).unregisterProvider('shared-faux');
      expect(runtime.getModel('shared-faux', 'shared-model')).toBeUndefined();
    } finally {
      for (const session of sessions) session.dispose();
      await rm(agentDir, { recursive: true, force: true });
    }
  });
});
