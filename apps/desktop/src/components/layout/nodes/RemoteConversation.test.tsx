// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionLocationKey, useNodesStore } from '@/stores/nodes';
import { RemoteConversation } from './RemoteConversation';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

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

  it('shows the node-owned permission and sends the selected decision', async () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' });
    const respondApproval = vi.fn().mockResolvedValue(undefined);
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'Spark', address: 'https://spark', fingerprint: 'pin',
        connectionState: 'connected', tools: ['bash'], workspaces: [{ id: 'repo', name: 'repo' }],
      }],
      sessions: { 'node-1': [{
        id: 'session-1', workspaceId: 'repo', name: 'Test', modified: '2026-01-01T00:00:00Z',
        engine: 'Pi', model: 'anthropic/claude', taskId: 'task-1',
      }] },
      messages: { [key]: [] },
      approvals: { [key]: {
        id: 'permission-1', taskId: 'task-1', contextId: 'session-1',
        title: 'Run command', description: 'pnpm test',
      } },
      activeLocationKey: key,
      respondApproval,
    });
    await act(async () => root.render(<RemoteConversation location={{ kind: 'node', nodeId: 'node-1', sessionId: 'session-1' }} />));
    expect(container.textContent).toContain('Run command');
    const approve = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Approve');
    await act(async () => approve?.click());
    expect(respondApproval).toHaveBeenCalledWith('node-1', 'session-1', true);
  });
});
