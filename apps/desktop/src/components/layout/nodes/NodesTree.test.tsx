// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodesStore } from '@/stores/nodes';
import { useSessionStore } from '@/stores/sessions';
import { NodesTree } from './NodesTree';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('NodesTree', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'sero', { configurable: true, value: { agentNodes: {
      onEvent: vi.fn().mockReturnValue(() => undefined),
    } } });
    useSessionStore.setState({ searchQuery: '' });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('uses workspace session rows and creates a session without a dialog', async () => {
    const createSession = vi.fn().mockResolvedValue(undefined);
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'https://gx10.local:7443', address: 'https://gx10.local:7443',
        fingerprint: 'pin', connectionState: 'connected', tools: ['write'],
        workspaces: [{ id: 'repo', name: 'Repo' }],
      }],
      sessions: { 'node-1': [{
        id: 'session-1', workspaceId: 'repo', name: 'Review node setup',
        modified: new Date().toISOString(), engine: 'Pi', model: 'anthropic/claude', thinkingLevel: 'off', approvalMode: 'ask',
      }] },
      expandedNodeIds: new Set(['node-1']),
      activeLocationKey: null,
      load: vi.fn().mockResolvedValue(undefined),
      createSession,
    });

    await act(async () => root.render(<NodesTree />));
    expect(container.textContent).toContain('gx10');
    expect(container.textContent).toContain('Repo');
    expect(container.textContent).toContain('Review node setup');
    expect(container.textContent).not.toContain('anthropic/claude');
    expect(container.textContent).not.toContain('New node session');
    const nodeHeader = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('gx10'));
    expect(nodeHeader?.className).not.toContain('hover:bg');
    expect(nodeHeader?.lastElementChild?.getAttribute('aria-label')).toBe('Connected');
    expect(container.querySelector('[aria-label="Add Agent Node"]')?.parentElement?.className).toContain('pr-0');

    const addSession = container.querySelector<HTMLElement>('[aria-label="New session in Repo"]');
    await act(async () => addSession?.click());
    expect(createSession).toHaveBeenCalledWith('node-1', 'repo');
  });

  it('applies the regular session search to remote sessions', async () => {
    useNodesStore.setState({
      nodes: [{
        id: 'node-1', name: 'GX10', address: 'https://gx10.local', fingerprint: 'pin',
        connectionState: 'connected', tools: [], workspaces: [{ id: 'repo', name: 'Repo' }],
      }],
      sessions: { 'node-1': [
        { id: 'one', workspaceId: 'repo', name: 'Visible task', modified: '', engine: 'Pi', model: 'a/b', thinkingLevel: 'off', approvalMode: 'ask' },
        { id: 'two', workspaceId: 'repo', name: 'Hidden task', modified: '', engine: 'Pi', model: 'a/b', thinkingLevel: 'off', approvalMode: 'ask' },
      ] },
      expandedNodeIds: new Set(['node-1']),
      load: vi.fn().mockResolvedValue(undefined),
    });
    useSessionStore.setState({ searchQuery: 'visible' });
    await act(async () => root.render(<NodesTree />));
    expect(container.textContent).toContain('Visible task');
    expect(container.textContent).not.toContain('Hidden task');
  });
});
