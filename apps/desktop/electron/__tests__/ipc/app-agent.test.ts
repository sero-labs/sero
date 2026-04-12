import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';
import { syncAppSessionModel } from '@electron/ipc/agent/handlers/app-agent';

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

    await syncAppSessionModel(session, targetModel);

    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith(targetModel);
  });

  it('does not update reused app sessions when they already match the shared model', async () => {
    const targetModel = createModel('openai', 'gpt-5.4-mini');
    const setModel = vi.fn(async () => {});
    const session = {
      model: createModel('openai', 'gpt-5.4-mini'),
      setModel,
    } as unknown as AgentSession;

    await syncAppSessionModel(session, targetModel);

    expect(setModel).not.toHaveBeenCalled();
  });

  it('skips model updates when there is no shared model to apply', async () => {
    const setModel = vi.fn(async () => {});
    const session = {
      model: createModel('openai', 'gpt-5.4-mini'),
      setModel,
    } as unknown as AgentSession;

    await syncAppSessionModel(session, null);

    expect(setModel).not.toHaveBeenCalled();
  });
});
