import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';
import {
  syncAppSessionModel,
  syncAppSessionPoolModels,
} from '@electron/ipc/agent/core/app-agent-session-model-sync';

function createModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

describe('syncAppSessionModel', () => {
  it('updates reused app sessions when the shared model selection changes', async () => {
    const targetModel = createModel('openai', 'gpt-5.4-mini');
    const setModel = vi.fn(async () => {});
    const session = {
      model: createModel('anthropic', 'claude-sonnet-4-6'),
      setModel,
    } as unknown as AgentSession;

    const changed = await syncAppSessionModel(session, targetModel);

    expect(changed).toBe(true);
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith(targetModel);
  });

  it('does not update reused app sessions when they already hold the shared model instance', async () => {
    const targetModel = createModel('openai', 'gpt-5.4-mini');
    const setModel = vi.fn(async () => {});
    const session = {
      model: targetModel,
      setModel,
    } as unknown as AgentSession;

    const changed = await syncAppSessionModel(session, targetModel);

    expect(changed).toBe(false);
    expect(setModel).not.toHaveBeenCalled();
  });

  it('swaps in refreshed shared model objects even when provider and id stay the same', async () => {
    const targetModel = createModel('openai', 'gpt-5.4-mini');
    const setModel = vi.fn(async () => {});
    const runtimeState = { model: createModel('openai', 'gpt-5.4-mini') };
    const session = {
      model: runtimeState.model,
      agent: { state: runtimeState },
      setModel,
    } as unknown as AgentSession;

    const changed = await syncAppSessionModel(session, targetModel);

    expect(changed).toBe(true);
    expect(runtimeState.model).toBe(targetModel);
    expect(setModel).not.toHaveBeenCalled();
  });

  it('clears reused app sessions when no shared model remains available', async () => {
    const setModel = vi.fn(async () => {});
    const runtimeState = { model: createModel('openai', 'gpt-5.4-mini') };
    const session = {
      model: runtimeState.model,
      agent: { state: runtimeState },
      setModel,
    } as unknown as AgentSession;

    const changed = await syncAppSessionModel(session, null);

    expect(changed).toBe(true);
    expect(runtimeState.model).toBeUndefined();
    expect(setModel).not.toHaveBeenCalled();
  });

  it('reconciles every reused app session in the pool during a model refresh', async () => {
    const targetModel = createModel('openai', 'gpt-5.4-mini');
    const matchingSetModel = vi.fn(async () => {});
    const staleSetModel = vi.fn(async () => {});
    const matchingSession = {
      model: targetModel,
      setModel: matchingSetModel,
    } as unknown as AgentSession;
    const staleSession = {
      model: createModel('anthropic', 'claude-sonnet-4-6'),
      setModel: staleSetModel,
    } as unknown as AgentSession;

    const updated = await syncAppSessionPoolModels(
      [matchingSession, staleSession],
      targetModel,
    );

    expect(updated).toBe(1);
    expect(matchingSetModel).not.toHaveBeenCalled();
    expect(staleSetModel).toHaveBeenCalledWith(targetModel);
  });
});
