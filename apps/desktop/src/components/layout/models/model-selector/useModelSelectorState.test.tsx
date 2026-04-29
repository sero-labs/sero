// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelSelectorState } from './useModelSelectorState';

const setModelSpy = vi.fn<(sessionId: string, provider: string, modelId: string) => void>();
const setThinkingLevelSpy = vi.fn<(sessionId: string, level: string) => void>();

const focusedModelState = {
  availableModels: [
    {
      provider: 'anthropic',
      displayName: 'Anthropic',
      logo: '/anthropic.svg',
      models: [
        {
          provider: 'anthropic',
          modelId: 'claude-sonnet-4',
          name: 'Claude Sonnet 4',
          reasoning: true,
        },
        {
          provider: 'anthropic',
          modelId: 'claude-haiku-3',
          name: 'Claude Haiku 3',
          reasoning: false,
        },
      ],
    },
    {
      provider: 'openai',
      displayName: 'OpenAI',
      logo: '/openai.svg',
      models: [
        {
          provider: 'openai',
          modelId: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          reasoning: true,
        },
      ],
    },
  ],
  availableThinkingLevels: ['off', 'low', 'medium', 'high'],
  model: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
  },
  supportsXhigh: true,
  thinkingLevel: 'medium',
};

const modelPreferences = {
  favouriteModels: ['anthropic/claude-sonnet-4'],
  hiddenModels: ['anthropic/claude-haiku-3'],
  hiddenProviders: ['openai'],
};

vi.mock('@/stores/agent', () => ({
  useAgentStore: <T,>(selector: (state: {
    setModel: typeof setModelSpy;
    setThinkingLevel: typeof setThinkingLevelSpy;
  }) => T) => selector({
    setModel: setModelSpy,
    setThinkingLevel: setThinkingLevelSpy,
  }),
}));

vi.mock('@/stores/agent-selectors', () => ({
  useFocusedModelState: () => focusedModelState,
  useFocusedSessionId: () => 'session-123',
}));

vi.mock('@/stores/model-preferences', () => ({
  modelKey: (provider: string, modelId: string) => `${provider}/${modelId}`,
  useModelPreferences: () => modelPreferences,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  latestState = useModelSelectorState();
  return null;
}

let latestState: ReturnType<typeof useModelSelectorState> | null = null;

describe('useModelSelectorState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    latestState = null;
    focusedModelState.thinkingLevel = 'medium';
    setModelSpy.mockReset();
    setThinkingLevelSpy.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    vi.unstubAllGlobals();
  });

  it('derives visible groups and favourites from preferences', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestState?.triggerLabel).toBe('Claude Sonnet 4');
    expect(latestState?.triggerProviderDisplayName).toBe('Anthropic');
    expect(latestState?.triggerThinkingLabel).toBe('Med');
    expect(latestState?.filteredGroups).toHaveLength(1);
    expect(latestState?.filteredGroups[0]?.models).toEqual([
      expect.objectContaining({ modelId: 'claude-sonnet-4' }),
    ]);
    expect(latestState?.favourites).toEqual([
      expect.objectContaining({
        model: expect.objectContaining({ modelId: 'claude-sonnet-4' }),
      }),
    ]);
  });

  it('clears search when opening and hides favourites while filtering', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.setFilter('claude');
    });
    expect(latestState?.favourites).toHaveLength(0);

    act(() => {
      latestState?.handleOpenChange(true);
    });
    expect(latestState?.open).toBe(true);
    expect(latestState?.filter).toBe('');
    expect(latestState?.isPrimed).toBe(true);
  });

  it('hides the trigger thinking badge when the focused model is set to off', async () => {
    focusedModelState.thinkingLevel = 'off';

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestState?.triggerThinkingLabel).toBeNull();
  });

  it('routes model and thinking selections through the focused session actions', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.handleModelSelect('anthropic', 'claude-sonnet-4');
      latestState?.handleThinkingSelect('high');
    });

    expect(setModelSpy).toHaveBeenCalledWith('session-123', 'anthropic', 'claude-sonnet-4');
    expect(setThinkingLevelSpy).toHaveBeenCalledWith('session-123', 'high');
  });
});
