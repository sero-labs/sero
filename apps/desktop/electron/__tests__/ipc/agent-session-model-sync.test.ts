import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  clampThinkingLevel,
  type Api,
  type Model,
  type ModelThinkingLevel,
  type ThinkingLevelMap,
} from '@earendil-works/pi-ai';
import { ensureSessionHasAvailableModel } from '@electron/ipc/agent/core/agent-session-model-sync';

function createModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

describe('ensureSessionHasAvailableModel', () => {
  const findModel = vi.fn();
  const getAvailable = vi.fn();
  const settingsReload = vi.fn();
  const getDefaultProvider = vi.fn(() => undefined);
  const getDefaultModel = vi.fn(() => undefined);
  const getGlobalSettings = vi.fn(() => ({}));
  const setModel = vi.fn(async () => {});

  beforeEach(() => {
    findModel.mockReset();
    getAvailable.mockReset();
    settingsReload.mockReset();
    getDefaultProvider.mockReset().mockReturnValue(undefined);
    getDefaultModel.mockReset().mockReturnValue(undefined);
    getGlobalSettings.mockReset().mockReturnValue({});
    setModel.mockReset();
  });

  it('clears the live session model when availability drops to zero', async () => {
    const runtimeState = { model: createModel('openai', 'gpt-5.4-mini') };
    const session = {
      model: runtimeState.model,
      agent: { state: runtimeState },
      setModel,
      modelRuntime: {
        getModel: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockResolvedValue([]),
      },
      settingsManager: {
        reload: settingsReload,
        getDefaultProvider,
        getDefaultModel,
        getGlobalSettings,
      },
    } as unknown as AgentSession;

    const changed = await ensureSessionHasAvailableModel(session);

    expect(changed).toBe(true);
    expect(runtimeState.model).toBeUndefined();
    expect(setModel).not.toHaveBeenCalled();
  });

  it('does nothing when the session is already model-less and nothing is available', async () => {
    const session = {
      model: undefined,
      agent: { state: { model: undefined } },
      setModel,
      modelRuntime: {
        getModel: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockResolvedValue([]),
      },
      settingsManager: {
        reload: settingsReload,
        getDefaultProvider,
        getDefaultModel,
        getGlobalSettings,
      },
    } as unknown as AgentSession;

    const changed = await ensureSessionHasAvailableModel(session);

    expect(changed).toBe(false);
    expect(setModel).not.toHaveBeenCalled();
  });

  function createReasoningModel(thinkingLevelMap: ThinkingLevelMap): Model<Api> {
    return {
      provider: 'anthropic',
      id: 'claude-opus-5',
      reasoning: true,
      thinkingLevelMap,
    } as unknown as Model<Api>;
  }

  /**
   * Build a session whose `setThinkingLevel` mirrors the SDK contract: clamp to
   * the current model's capabilities, and record a level change only when the
   * effective level actually moves.
   */
  function createThinkingSession(options: {
    initialModel: Model<Api>;
    refreshedModel: Model<Api>;
    level: ModelThinkingLevel;
  }) {
    const state = {
      model: options.initialModel,
      thinkingLevel: options.level as string,
    };
    const levelWrites: string[] = [];
    const session = {
      get model() { return state.model; },
      get thinkingLevel() { return state.thinkingLevel; },
      agent: { state },
      setThinkingLevel(requested: string) {
        const effective: string = clampThinkingLevel(
          state.model as Model<Api>,
          requested as ModelThinkingLevel,
        );
        if (effective === state.thinkingLevel) return;
        state.thinkingLevel = effective;
        levelWrites.push(effective);
      },
      setModel,
      modelRuntime: {
        getModel: () => options.refreshedModel,
        getAvailable: () => Promise.resolve([options.refreshedModel]),
      },
      settingsManager: {
        reload: settingsReload,
        getDefaultProvider,
        getDefaultModel,
        getGlobalSettings,
      },
    } as unknown as AgentSession;
    return { session, state, levelWrites };
  }

  it('clamps the thinking level when a refreshed model drops a level', async () => {
    const initialModel = createReasoningModel({
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
    });
    const refreshedModel = createReasoningModel({
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
    });
    const { session, state, levelWrites } = createThinkingSession({
      initialModel,
      refreshedModel,
      level: 'xhigh',
    });

    await expect(ensureSessionHasAvailableModel(session)).resolves.toBe(false);

    expect(state.model).toBe(refreshedModel);
    expect(state.thinkingLevel).toBe('high');
    expect(levelWrites).toEqual(['high']);
  });

  it('records no thinking-level change when the refreshed model keeps its levels', async () => {
    const levels: ThinkingLevelMap = {
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
    };
    const { session, state, levelWrites } = createThinkingSession({
      initialModel: createReasoningModel({ ...levels }),
      refreshedModel: createReasoningModel({ ...levels }),
      level: 'xhigh',
    });

    await ensureSessionHasAvailableModel(session);

    expect(state.model).not.toBeUndefined();
    expect(state.thinkingLevel).toBe('xhigh');
    expect(levelWrites).toEqual([]);
    expect(setModel).not.toHaveBeenCalled();
  });
});
