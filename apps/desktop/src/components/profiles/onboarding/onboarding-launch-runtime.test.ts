import { describe, expect, it, vi } from 'vitest';
import type {
  ChatMessage,
  ModelTierSettings,
  OnboardingState,
  SessionModelState,
} from '@/types/ipc';
import {
  buildAuthRecovery,
  runWelcomeOnboardingFlow,
  type OnboardingLaunchRuntimeDeps,
} from './onboarding-launch-runtime';

function createSessionModelState(provider: string, modelId: string): SessionModelState {
  return {
    model: {
      provider,
      modelId,
      name: modelId,
      reasoning: true,
      availableThinkingLevels: ['off', 'low', 'medium', 'high'],
      supportsXhigh: false,
    },
    thinkingLevel: 'high',
    availableThinkingLevels: ['off', 'low', 'medium', 'high'],
    supportsXhigh: false,
    availableModels: [
      {
        provider,
        displayName: provider,
        logo: '',
        models: [
          {
            provider,
            modelId,
            name: modelId,
            reasoning: true,
            availableThinkingLevels: ['off', 'low', 'medium', 'high'],
            supportsXhigh: false,
          },
        ],
      },
    ],
  };
}

function createOnboardingState(overrides: Partial<OnboardingState> = {}): OnboardingState {
  const tiers: ModelTierSettings = {
    HIGH: { provider: 'anthropic', modelId: 'claude-3.7-sonnet', thinkingLevel: 'high' },
    MED: { provider: 'anthropic', modelId: 'claude-3.5-sonnet', thinkingLevel: 'medium' },
    LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'low' },
  };

  return {
    needed: true,
    phase: 'ready',
    hasAnyUsableModels: true,
    hasImportedCredentials: true,
    memoryBootstrapComplete: false,
    recommendation: {
      tiers,
      preferredProvider: 'anthropic',
      sourcesByTier: {},
    },
    providerHealth: [
      {
        providerId: 'openai',
        displayName: 'OpenAI',
        status: 'broken_invalid',
        message: 'Expired token',
        canReconnect: true,
        hasUsableModels: true,
        usableModelIds: ['gpt-4.1-mini'],
      },
      {
        providerId: 'anthropic',
        displayName: 'Anthropic',
        status: 'healthy',
        canReconnect: false,
        hasUsableModels: true,
        usableModelIds: ['claude-3.7-sonnet', 'claude-3.5-sonnet'],
      },
    ],
    availableModelGroups: [],
    warnings: [],
    invalidTiers: [],
    containerRuntime: {
      status: 'available',
      message: 'Apple containers are available.',
      recommended: true,
    },
    ...overrides,
  };
}

function createDeps(): {
  deps: OnboardingLaunchRuntimeDeps;
  spies: {
    agentOpen: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['open']>>;
    agentSetModel: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['setModel']>>;
    agentGetModelState: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['getModelState']>>;
    agentSetThinkingLevel: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['setThinkingLevel']>>;
    agentPrompt: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['prompt']>>;
    agentClose: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agent']['close']>>;
    onboardingGetState: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['onboarding']['getState']>>;
    createSession: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['createSession']>>;
    renameSession: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['renameSession']>>;
    deleteSession: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['deleteSession']>>;
    setActiveSession: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['setActiveSession']>>;
    focusSession: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['agentStore']['focusSession']>>;
    setChatPanelOpen: ReturnType<typeof vi.fn<OnboardingLaunchRuntimeDeps['appStore']['setChatPanelOpen']>>;
    warn: ReturnType<typeof vi.fn<(message?: unknown, ...optionalParams: unknown[]) => void>>;
  };
} {
  const agentOpen = vi.fn<OnboardingLaunchRuntimeDeps['agent']['open']>();
  const agentSetModel = vi.fn<OnboardingLaunchRuntimeDeps['agent']['setModel']>();
  const agentGetModelState = vi.fn<OnboardingLaunchRuntimeDeps['agent']['getModelState']>();
  const agentSetThinkingLevel = vi.fn<OnboardingLaunchRuntimeDeps['agent']['setThinkingLevel']>();
  const agentPrompt = vi.fn<OnboardingLaunchRuntimeDeps['agent']['prompt']>();
  const agentClose = vi.fn<OnboardingLaunchRuntimeDeps['agent']['close']>();
  const onboardingGetState = vi.fn<OnboardingLaunchRuntimeDeps['onboarding']['getState']>();
  const createSession = vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['createSession']>();
  const renameSession = vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['renameSession']>();
  const deleteSession = vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['deleteSession']>();
  const setActiveSession = vi.fn<OnboardingLaunchRuntimeDeps['sessionStore']['setActiveSession']>();
  const focusSession = vi.fn<OnboardingLaunchRuntimeDeps['agentStore']['focusSession']>();
  const setChatPanelOpen = vi.fn<OnboardingLaunchRuntimeDeps['appStore']['setChatPanelOpen']>();
  const warn = vi.fn<(message?: unknown, ...optionalParams: unknown[]) => void>();

  agentSetModel.mockResolvedValue(createSessionModelState('anthropic', 'claude-3.7-sonnet'));
  agentGetModelState.mockResolvedValue(null);
  agentSetThinkingLevel.mockResolvedValue(createSessionModelState('anthropic', 'claude-3.7-sonnet'));
  agentPrompt.mockResolvedValue();
  agentClose.mockResolvedValue();
  renameSession.mockResolvedValue();
  deleteSession.mockResolvedValue();

  return {
    deps: {
      agent: {
        open: agentOpen,
        setModel: agentSetModel,
        getModelState: agentGetModelState,
        setThinkingLevel: agentSetThinkingLevel,
        prompt: agentPrompt,
        close: agentClose,
      },
      onboarding: {
        getState: onboardingGetState,
      },
      sessionStore: {
        createSession,
        renameSession,
        deleteSession,
        setActiveSession,
      },
      agentStore: {
        focusSession,
      },
      appStore: {
        setChatPanelOpen,
      },
      logger: { warn },
    },
    spies: {
      agentOpen,
      agentSetModel,
      agentGetModelState,
      agentSetThinkingLevel,
      agentPrompt,
      agentClose,
      onboardingGetState,
      createSession,
      renameSession,
      deleteSession,
      setActiveSession,
      focusSession,
      setChatPanelOpen,
      warn,
    },
  };
}

function createConversation(text: string): ChatMessage[] {
  return [
    { type: 'user', id: 'user-1', text: 'start onboarding' },
    { type: 'assistant', id: 'assistant-1', text, isStreaming: false },
  ];
}

describe('onboarding-launch-runtime', () => {
  it('runs temp-session bootstrap, cleans it up, and opens the welcome session', async () => {
    const { deps, spies } = createDeps();
    const tiers: ModelTierSettings = {
      HIGH: { provider: 'anthropic', modelId: 'claude-3.7-sonnet', thinkingLevel: 'high' },
      LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'low' },
    };

    spies.createSession
      .mockResolvedValueOnce({ id: 'temp-session', path: '/tmp/temp-session' })
      .mockResolvedValueOnce({ id: 'welcome-session', path: '/tmp/welcome-session' });
    spies.agentOpen
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(createConversation('Memory bootstrap complete.'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(createConversation('Welcome to Sero.'));
    spies.onboardingGetState.mockResolvedValue(
      createOnboardingState({ memoryBootstrapComplete: true }),
    );

    const result = await runWelcomeOnboardingFlow(deps, tiers);

    expect(result).toEqual({ kind: 'finished' });
    expect(spies.createSession).toHaveBeenNthCalledWith(1, 'global');
    expect(spies.createSession).toHaveBeenNthCalledWith(2, 'global');
    expect(spies.renameSession).toHaveBeenCalledWith('welcome-session', 'Welcome');
    expect(spies.agentPrompt).toHaveBeenNthCalledWith(
      1,
      'temp-session',
      "Hey! I'm new here — set up my memory so you can get to know me.",
    );
    expect(spies.agentPrompt).toHaveBeenNthCalledWith(
      2,
      'welcome-session',
      "The user just finished setting up their profile. Say hello, introduce yourself briefly, and let them know you're ready to help.",
    );
    expect(spies.agentClose).toHaveBeenCalledWith('temp-session');
    expect(spies.deleteSession).toHaveBeenCalledWith('/tmp/temp-session');
    expect(spies.setActiveSession).toHaveBeenCalledTimes(2);
    expect(spies.setActiveSession).toHaveBeenNthCalledWith(1, 'welcome-session');
    expect(spies.setActiveSession).toHaveBeenNthCalledWith(2, 'welcome-session');
    expect(spies.focusSession).toHaveBeenCalledWith('welcome-session');
    expect(spies.setChatPanelOpen).toHaveBeenCalledWith(true);
    expect(spies.warn).not.toHaveBeenCalled();
  });

  it('returns refreshed auth recovery data when bootstrap hits an authentication error', async () => {
    const { deps, spies } = createDeps();
    const authError = '_Assistant error: Authentication failed for "openai"_';

    spies.createSession.mockResolvedValueOnce({ id: 'temp-session', path: '/tmp/temp-session' });
    spies.agentOpen
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(createConversation(authError));
    spies.onboardingGetState.mockResolvedValue(createOnboardingState());

    const result = await runWelcomeOnboardingFlow(deps, {
      HIGH: { provider: 'openai', modelId: 'gpt-4.1', thinkingLevel: 'high' },
    });

    expect(result.kind).toBe('auth-error');
    if (result.kind !== 'auth-error') {
      throw new Error('Expected auth-error result');
    }
    expect(result.message).toBe('Authentication failed for "openai"');
    expect(spies.agentClose).toHaveBeenCalledWith('temp-session');
    expect(spies.deleteSession).toHaveBeenCalledWith('/tmp/temp-session');

    const recovery = buildAuthRecovery(result.onboardingState, result.message);
    expect(recovery).toEqual({
      canAutoRetry: true,
      retryTiers: result.onboardingState.recommendation?.tiers,
      statusMessage: 'OpenAI stopped working. Switching to Anthropic.',
    });
  });
});
