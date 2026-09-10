import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';

const mocks = vi.hoisted(() => ({
  modelRuntimeRefresh: vi.fn(),
  modelRegistryGetAvailable: vi.fn(),
  settingsReload: vi.fn(),
  getGlobalSettings: vi.fn(() => ({})),
  ensureInfra: vi.fn(),
  refreshInfraModelSelection: vi.fn(),
  applyRuntimeSettings: vi.fn(),
  cleanupUnavailableModelSelections: vi.fn(),
  getAgentPoolEntries: vi.fn(),
  emitAgentEvent: vi.fn(),
  getAppAgentSessions: vi.fn(),
  ensureSessionHasAvailableModel: vi.fn(),
  syncAppSessionPoolModels: vi.fn(),
  buildModelState: vi.fn(),
  syncQwenChatTemplateReasoning: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  ensureInfra: mocks.ensureInfra,
  refreshInfraModelSelection: mocks.refreshInfraModelSelection,
  applyRuntimeSettings: mocks.applyRuntimeSettings,
}));

vi.mock('@electron/shared/settings/cleanup-unavailable-model-selections', () => ({
  cleanupUnavailableModelSelections: mocks.cleanupUnavailableModelSelections,
}));

vi.mock('@electron/ipc/agent/core/agent', () => ({
  getAgentPoolEntries: mocks.getAgentPoolEntries,
  emitAgentEvent: mocks.emitAgentEvent,
}));

vi.mock('@electron/ipc/agent/handlers/app-agent', () => ({
  getAppAgentSessions: mocks.getAppAgentSessions,
}));

vi.mock('@electron/ipc/agent/core/agent-session-model-sync', () => ({
  ensureSessionHasAvailableModel: mocks.ensureSessionHasAvailableModel,
}));

vi.mock('@electron/ipc/agent/core/app-agent-session-model-sync', () => ({
  syncAppSessionPoolModels: mocks.syncAppSessionPoolModels,
}));

vi.mock('@electron/ipc/agent/core/agent-helpers', () => ({
  buildModelState: mocks.buildModelState,
}));

vi.mock('@electron/shared/providers/qwen-chat-template-reasoning', () => ({
  syncQwenChatTemplateReasoning: mocks.syncQwenChatTemplateReasoning,
}));

import {
  queueModelAvailabilityRefresh,
  refreshModelAvailability,
} from '@electron/ipc/agent/core/model-availability-refresh';

function createModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

const originalOffline = process.env.PI_OFFLINE;

function restoreOffline(): void {
  if (originalOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = originalOffline;
}

const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  consoleWarn.mockClear();
    mocks.modelRuntimeRefresh.mockReset().mockResolvedValue({
      aborted: false,
      errors: new Map(),
    });
    mocks.modelRegistryGetAvailable.mockReset();
    mocks.settingsReload.mockReset();
    mocks.getGlobalSettings.mockReset().mockReturnValue({});
    mocks.ensureInfra.mockReset();
    mocks.refreshInfraModelSelection.mockReset();
    mocks.applyRuntimeSettings.mockReset();
    mocks.cleanupUnavailableModelSelections.mockReset();
    mocks.getAgentPoolEntries.mockReset();
    mocks.emitAgentEvent.mockReset();
    mocks.getAppAgentSessions.mockReset();
    mocks.ensureSessionHasAvailableModel.mockReset();
    mocks.syncAppSessionPoolModels.mockReset();
    mocks.buildModelState.mockReset();
  mocks.syncQwenChatTemplateReasoning.mockReset().mockResolvedValue(undefined);
});

describe('refreshModelAvailability', () => {
  it('reconciles shared state, live chat sessions, and reused app-agent sessions in one flow', async () => {
    const sharedModel = createModel('openai', 'gpt-5.4-mini');
    const availableModels = [
      createModel('openai', 'gpt-5.4-mini'),
      createModel('anthropic', 'claude-sonnet-4-6'),
    ];
    const chatSessionA = { id: 'chat-a' } as unknown as AgentSession;
    const chatSessionB = { id: 'chat-b' } as unknown as AgentSession;
    const appSession = { id: 'app-1' } as unknown as AgentSession;

    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: {
        refresh: mocks.modelRuntimeRefresh,
      },
      modelRegistry: {
        getError: vi.fn(() => null),
        getAvailable: mocks.modelRegistryGetAvailable.mockReturnValue(availableModels),
      },
      settingsManager: {
        reload: mocks.settingsReload,
        getGlobalSettings: mocks.getGlobalSettings,
      },
    });
    mocks.cleanupUnavailableModelSelections.mockReturnValue(true);
    mocks.refreshInfraModelSelection.mockReturnValue(sharedModel);
    mocks.getAgentPoolEntries.mockReturnValue([
      ['chat-a', { session: chatSessionA }],
      ['chat-b', { session: chatSessionB }],
    ]);
    mocks.ensureSessionHasAvailableModel
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mocks.buildModelState
      .mockReturnValueOnce({ model: { provider: 'openai', modelId: 'gpt-5.4-mini', name: 'GPT 5.4 Mini', reasoning: true }, thinkingLevel: 'high', availableThinkingLevels: ['high'], supportsXhigh: false, availableModels: [] })
      .mockReturnValueOnce({ model: { provider: 'anthropic', modelId: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', reasoning: true }, thinkingLevel: 'high', availableThinkingLevels: ['high'], supportsXhigh: false, availableModels: [] });
    mocks.getAppAgentSessions.mockReturnValue([appSession]);
    mocks.syncAppSessionPoolModels.mockResolvedValue(1);

    const result = await refreshModelAvailability();

    expect(mocks.modelRuntimeRefresh).toHaveBeenCalledOnce();
    expect(mocks.modelRuntimeRefresh.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.syncQwenChatTemplateReasoning.mock.invocationCallOrder[0]);
    expect(mocks.cleanupUnavailableModelSelections).toHaveBeenCalledWith([
      { provider: 'openai', modelId: 'gpt-5.4-mini' },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
    ]);
    expect(mocks.settingsReload).toHaveBeenCalledOnce();
    expect(mocks.applyRuntimeSettings).toHaveBeenCalledOnce();
    expect(mocks.refreshInfraModelSelection).toHaveBeenCalledOnce();
    expect(mocks.ensureSessionHasAvailableModel).toHaveBeenCalledTimes(2);
    expect(mocks.emitAgentEvent).toHaveBeenCalledTimes(2);
    expect(mocks.syncAppSessionPoolModels).toHaveBeenCalledWith([appSession], sharedModel);
    expect(result).toEqual({
      sharedModel,
      updatedChatSessions: 1,
      updatedAppSessions: 1,
      refreshWarnings: [],
      registryError: undefined,
    });
  });

  it('keeps reconciling other sessions when one live chat session fails', async () => {
    const sharedModel = createModel('openai', 'gpt-5.4-mini');
    const healthySession = { id: 'chat-b' } as unknown as AgentSession;

    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: {
        refresh: mocks.modelRuntimeRefresh,
      },
      modelRegistry: {
        getError: vi.fn(() => null),
        getAvailable: mocks.modelRegistryGetAvailable.mockReturnValue([sharedModel]),
      },
      settingsManager: {
        reload: mocks.settingsReload,
        getGlobalSettings: mocks.getGlobalSettings,
      },
    });
    mocks.cleanupUnavailableModelSelections.mockReturnValue(false);
    mocks.refreshInfraModelSelection.mockReturnValue(sharedModel);
    mocks.getAgentPoolEntries.mockReturnValue([
      ['broken', { session: {} }],
      ['healthy', { session: healthySession }],
    ]);
    mocks.ensureSessionHasAvailableModel
      .mockRejectedValueOnce(new Error('stale session'))
      .mockResolvedValueOnce(false);
    mocks.buildModelState.mockReturnValue({ model: { provider: 'openai', modelId: 'gpt-5.4-mini', name: 'GPT 5.4 Mini', reasoning: true }, thinkingLevel: 'high', availableThinkingLevels: ['high'], supportsXhigh: false, availableModels: [] });
    mocks.getAppAgentSessions.mockReturnValue([]);
    mocks.syncAppSessionPoolModels.mockResolvedValue(0);

    const result = await refreshModelAvailability();

    expect(mocks.settingsReload).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(mocks.emitAgentEvent).toHaveBeenCalledTimes(1);
    expect(result.updatedChatSessions).toBe(0);
    expect(result.updatedAppSessions).toBe(0);
  });

  it('reconciles sessions after partial provider and availability errors', async () => {
    const sharedModel = createModel('openai', 'gpt-5.4-mini');
    mocks.modelRuntimeRefresh.mockResolvedValue({
      aborted: false,
      errors: new Map([['custom', new Error('catalog unavailable')]]),
    });
    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: { refresh: mocks.modelRuntimeRefresh },
      modelRegistry: {
        getError: vi.fn(() => 'Provider "broken": invalid configuration'),
        getAvailable: mocks.modelRegistryGetAvailable.mockReturnValue([sharedModel]),
      },
      settingsManager: {
        reload: mocks.settingsReload,
        getGlobalSettings: mocks.getGlobalSettings,
      },
    });
    mocks.cleanupUnavailableModelSelections.mockReturnValue(false);
    mocks.refreshInfraModelSelection.mockReturnValue(sharedModel);
    mocks.getAgentPoolEntries.mockReturnValue([]);
    mocks.getAppAgentSessions.mockReturnValue([]);
    mocks.syncAppSessionPoolModels.mockResolvedValue(0);

    const result = await refreshModelAvailability();

    expect(mocks.cleanupUnavailableModelSelections).toHaveBeenCalledOnce();
    expect(mocks.refreshInfraModelSelection).toHaveBeenCalledOnce();
    expect(result.refreshWarnings).toEqual([
      'Provider model refresh failed: custom: catalog unavailable',
      'Provider "broken": invalid configuration',
    ]);
    expect(result.registryError).toBe('Provider "broken": invalid configuration');
  });
});

describe('queueModelAvailabilityRefresh', () => {
  afterEach(restoreOffline);

  function mockInfra(): void {
    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: { refresh: mocks.modelRuntimeRefresh },
      modelRegistry: {
        getError: vi.fn(() => null),
        getAvailable: mocks.modelRegistryGetAvailable.mockReturnValue([]),
      },
      settingsManager: {
        reload: mocks.settingsReload,
        getGlobalSettings: mocks.getGlobalSettings,
      },
    });
    mocks.getAgentPoolEntries.mockReturnValue([]);
    mocks.getAppAgentSessions.mockReturnValue([]);
    mocks.syncAppSessionPoolModels.mockResolvedValue(0);
  }

  it('keeps network access for a credential change when no offline intent is set', async () => {
    delete process.env.PI_OFFLINE;
    mockInfra();

    await queueModelAvailabilityRefresh({ force: true });

    const options = mocks.modelRuntimeRefresh.mock.calls[0][0];
    expect(options.force).toBe(true);
    expect(options.allowNetwork).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  // Pi's ModelRuntime.create() disables model network access whenever
  // PI_OFFLINE is set at all, so "0" disables it too.
  it.each(['1', 'true', '0'])('suppresses network access when PI_OFFLINE=%s', async (value) => {
    process.env.PI_OFFLINE = value;
    mockInfra();

    await queueModelAvailabilityRefresh({ force: true });

    const options = mocks.modelRuntimeRefresh.mock.calls[0][0];
    expect(options.allowNetwork).toBe(false);
    expect(options.force).toBe(false);
  });

  it('serializes overlapping refreshes so a tick cannot overlap a credential change', async () => {
    delete process.env.PI_OFFLINE;
    mockInfra();
    let releaseFirst: (() => void) | undefined;
    mocks.modelRuntimeRefresh
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseFirst = () => resolve({ aborted: false, errors: new Map() });
      }))
      .mockResolvedValueOnce({ aborted: false, errors: new Map() });

    const scheduled = queueModelAvailabilityRefresh();
    const credentialChange = queueModelAvailabilityRefresh({ force: true });
    await vi.waitFor(() => expect(mocks.modelRuntimeRefresh).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await Promise.all([scheduled, credentialChange]);

    expect(mocks.modelRuntimeRefresh).toHaveBeenCalledTimes(2);
  });
});
