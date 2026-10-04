import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { setRuntimeSessionModel } from '@electron/ipc/agent/core/sdk-private-adapter';

interface FakeSession {
  agent: {
    state: {
      model?: unknown;
    };
  };
}

function toAgentSession(session: FakeSession): AgentSession {
  return session as unknown as AgentSession;
}

describe('agent SDK private adapter', () => {
  it('updates the runtime model object through the narrow private adapter', () => {
    const session = {
      agent: { state: { model: { provider: 'openai', id: 'old-model' } } },
    } as FakeSession;
    const model = { provider: 'openai', id: 'gpt-5.4' } as never;

    setRuntimeSessionModel(toAgentSession(session), model);
    expect(session.agent.state.model).toBe(model);

    setRuntimeSessionModel(toAgentSession(session), undefined);
    expect(session.agent.state.model).toBeUndefined();
  });
});
