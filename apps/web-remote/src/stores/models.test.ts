import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelsStore, type SessionModel } from './models';
import { useConnectionStore } from './connection';

function fakeModel(overrides: Partial<SessionModel> = {}): SessionModel {
  return {
    provider: 'openai',
    modelId: 'gpt-5',
    name: 'GPT-5',
    reasoning: true,
    thinkingLevel: 'off',
    availableThinkingLevels: ['off', 'high'],
    availableModels: [{
      provider: 'openai',
      displayName: 'OpenAI',
      logo: '',
      models: [{ provider: 'openai', modelId: 'gpt-5', name: 'GPT-5', reasoning: true }],
    }],
    ...overrides,
  };
}

const client = {
  requestSessionModel: vi.fn(),
  setSessionModel: vi.fn(),
  setSessionThinking: vi.fn(),
};

describe('models store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({ bySession: {} });
    // The store reads the live client, so point it at the spy.
    useConnectionStore.setState({
      client: client as unknown as ReturnType<typeof useConnectionStore.getState>['client'],
    });
  });

  it('keeps the model the host confirms, under the session that asked', () => {
    const store = useModelsStore.getState();
    store.fetch('workspace-a', 'session-a');

    expect(client.requestSessionModel).toHaveBeenCalledWith('workspace-a', 'session-a');

    store.handleMessage({
      type: 'ok',
      requestType: 'get_session_model',
      data: fakeModel(),
    } as never);

    expect(useModelsStore.getState().bySession['session-a']?.name).toBe('GPT-5');
  });

  it('matches replies to sessions in the order they were asked for', () => {
    const store = useModelsStore.getState();
    store.fetch('workspace-a', 'session-a');
    store.fetch('workspace-a', 'session-b');

    store.handleMessage({
      type: 'ok',
      requestType: 'get_session_model',
      data: fakeModel({ name: 'First' }),
    } as never);
    store.handleMessage({
      type: 'ok',
      requestType: 'get_session_model',
      data: fakeModel({ name: 'Second' }),
    } as never);

    const { bySession } = useModelsStore.getState();
    expect(bySession['session-a']?.name).toBe('First');
    expect(bySession['session-b']?.name).toBe('Second');
  });

  it('keeps the last confirmed model when the host refuses a change', () => {
    const store = useModelsStore.getState();
    useModelsStore.setState({ bySession: { 'session-a': fakeModel() } });

    store.selectModel('workspace-a', 'session-a', 'anthropic', 'claude-opus-5');
    expect(client.setSessionModel).toHaveBeenCalledWith(
      'workspace-a',
      'session-a',
      'anthropic',
      'claude-opus-5',
    );

    store.handleMessage({
      type: 'error',
      requestType: 'set_session_model',
      message: 'No credentials for anthropic/claude-opus-5',
    } as never);

    // Nothing was applied optimistically, so the chip still reads GPT-5.
    expect(useModelsStore.getState().bySession['session-a']?.modelId).toBe('gpt-5');
  });

  it('applies the thinking level the host confirms', () => {
    const store = useModelsStore.getState();
    store.selectThinking('workspace-a', 'session-a', 'high');

    expect(client.setSessionThinking).toHaveBeenCalledWith('workspace-a', 'session-a', 'high');

    store.handleMessage({
      type: 'ok',
      requestType: 'set_session_thinking',
      data: fakeModel({ thinkingLevel: 'high' }),
    } as never);

    expect(useModelsStore.getState().bySession['session-a']?.thinkingLevel).toBe('high');
  });

  it('does not let another request type consume the queue', () => {
    const store = useModelsStore.getState();
    store.fetch('workspace-a', 'session-a');

    store.handleMessage({ type: 'ok', requestType: 'list_sessions', data: [] } as never);

    // Our own reply must still land on the session that asked.
    store.handleMessage({
      type: 'ok',
      requestType: 'get_session_model',
      data: fakeModel({ name: 'Mine' }),
    } as never);

    expect(useModelsStore.getState().bySession['session-a']?.name).toBe('Mine');
  });

  it('ignores a malformed model payload', () => {
    const store = useModelsStore.getState();
    store.fetch('workspace-a', 'session-a');

    store.handleMessage({
      type: 'ok',
      requestType: 'get_session_model',
      data: { provider: 'openai' },
    } as never);

    expect(useModelsStore.getState().bySession['session-a']).toBeUndefined();
  });
});
