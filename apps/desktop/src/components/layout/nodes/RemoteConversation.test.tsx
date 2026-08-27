// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionLocationKey, useNodesStore } from '@/stores/nodes';
import { RemoteConversation } from './RemoteConversation';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });

describe('RemoteConversation approval', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('can allow the remaining tool calls in a remote task', async () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' });
    const respondApproval = vi.fn().mockResolvedValue(undefined);
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'Spark', address: 'https://spark', fingerprint: 'pin',
        connectionState: 'connected', tools: ['bash'], workspaces: [{ id: 'repo', name: 'repo' }],
      }],
      sessions: { 'node-1': [{
        id: 'session-1', workspaceId: 'repo', name: 'Test', modified: '2026-01-01T00:00:00Z',
        engine: 'Pi', model: 'anthropic/claude', thinkingLevel: 'high', approvalMode: 'ask', taskId: 'task-1',
      }] },
      messages: { [key]: [] },
      models: { 'node-1': [{ providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true, availableThinkingLevels: ['off', 'high'] }] },
      approvals: { [key]: {
        id: 'permission-1', taskId: 'task-1', contextId: 'session-1',
        title: 'Run command', description: 'pnpm test',
      } },
      activeLocationKey: key,
      respondApproval,
    });
    await act(async () => root.render(<RemoteConversation location={{ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' }} />));
    expect(container.textContent).toContain('Run command');
    const allow = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Allow for session');
    await act(async () => allow?.click());
    expect(respondApproval).toHaveBeenCalledWith('node-1', 'session-1', true, 'session');
  });

  it('clears remote artifacts from the conversation', async () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' });
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'Spark', address: 'https://spark', fingerprint: 'pin',
        connectionState: 'connected', tools: ['bash'], workspaces: [{ id: 'repo', name: 'repo' }],
      }],
      sessions: { 'node-1': [{
        id: 'session-1', workspaceId: 'repo', name: 'Test', modified: '2026-01-01T00:00:00Z',
        engine: 'Pi', model: 'anthropic/claude', thinkingLevel: 'off', approvalMode: 'ask',
      }] },
      messages: { [key]: [] }, approvals: { [key]: null },
      models: { 'node-1': [{ providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true, availableThinkingLevels: ['off', 'high'] }] },
      artifacts: { [key]: [{ id: 'artifact-1', name: 'report.txt', mediaType: 'text/plain', inlineBase64: 'b2s=' }] },
      activeLocationKey: key,
    });
    await act(async () => root.render(<RemoteConversation location={{ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' }} />));
    const clear = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Clear');
    await act(async () => clear?.click());
    expect(useNodesStore.getState().artifacts[key]).toEqual([]);
  });

  it('uses the shared composer shell for remote send, model, and stop controls', async () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const cancelTask = vi.fn().mockResolvedValue(undefined);
    const setSessionModel = vi.fn().mockResolvedValue(undefined);
    const setSessionThinkingLevel = vi.fn().mockResolvedValue(undefined);
    const loadModels = vi.fn().mockResolvedValue(undefined);
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'Spark', address: 'https://spark', fingerprint: 'pin',
        connectionState: 'connected', tools: ['write'], workspaces: [{ id: 'repo', name: 'repo' }],
      }],
      sessions: { 'node-1': [{
        id: 'session-1', workspaceId: 'repo', name: 'Test', modified: '2026-01-01T00:00:00Z',
        engine: 'Pi', model: 'anthropic/claude', thinkingLevel: 'high', approvalMode: 'ask',
      }] },
      messages: { [key]: [] }, approvals: { [key]: null }, activeLocationKey: key,
      models: { 'node-1': [
        { providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true, availableThinkingLevels: ['off', 'medium', 'high'] },
        { providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5', reasoning: true, availableThinkingLevels: ['off', 'medium', 'high'] },
      ] },
      sendMessage,
      cancelTask,
      setSessionModel,
      setSessionThinkingLevel,
      loadModels,
    });
    await act(async () => root.render(
      <RemoteConversation location={{ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' }} />,
    ));

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message the agent…"]');
    expect(textarea).not.toBeNull();
    expect(container.querySelector('[aria-label="Remote session model"]')?.textContent).toContain('Claude');
    expect(container.querySelector('[aria-label="Command approval"]')).not.toBeNull();
    expect(container.textContent).not.toContain('1 tools');
    const modelTrigger = container.querySelector<HTMLElement>('[aria-label="Remote session model"]');
    expect(modelTrigger?.className).toContain('flex-1');
    expect(modelTrigger?.className).toContain('text-left');
    expect(modelTrigger?.querySelector('.max-w-none')).not.toBeNull();
    await act(async () => modelTrigger?.click());
    expect(document.body.textContent).toContain('Thinking');
    const mediumThinking = [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Med');
    await act(async () => mediumThinking?.click());
    expect(setSessionThinkingLevel).toHaveBeenCalledWith('node-1', 'session-1', 'medium');
    const nextModel = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('GPT-5'));
    await act(async () => nextModel?.click());
    expect(setSessionModel).toHaveBeenCalledWith('node-1', 'session-1', 'openai/gpt-5');
    await act(async () => {
      if (textarea) {
        const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setValue?.call(textarea, 'Run the task');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const submit = container.querySelector<HTMLButtonElement>('button[aria-label="Submit"]');
    await act(async () => submit?.click());
    expect(sendMessage).toHaveBeenCalledWith('node-1', 'session-1', 'Run the task');

    await act(async () => useNodesStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        'node-1': state.sessions['node-1'].map((item) => ({ ...item, taskId: 'task-1' })),
      },
    })));
    const stop = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Stop');
    await act(async () => stop?.click());
    expect(cancelTask).toHaveBeenCalledWith('node-1', 'task-1');
  });
});
