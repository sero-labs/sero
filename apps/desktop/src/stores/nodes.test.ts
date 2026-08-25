import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSessionLocationKey, sessionLocationKey, useNodesStore } from './nodes';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

const node = {
  id: 'spark:west', name: 'Spark', address: 'https://spark', fingerprint: 'sha256',
  connectionState: 'connected' as const, tools: ['read'], workspaces: [{ id: 'repo', name: 'Repo' }],
};
const session = { id: 'session:one', workspaceId: 'repo', modified: '2026-01-01T00:00:00Z', engine: 'Pi', model: 'opus' };
const ipcNode = {
  id: node.id, name: node.name, address: node.address, fingerprint: node.fingerprint,
  state: 'connected', lastSeenAt: null, tools: node.tools,
};
const ipcSession = {
  contextId: session.id, name: session.id, workspace: session.workspaceId,
  model: { providerId: 'test', modelId: 'opus' }, updatedAt: session.modified, runningTaskId: null,
};

describe('nodes store', () => {
  beforeEach(() => {
    useNodesStore.setState({ nodes: [], sessions: {}, messages: {}, providers: {}, controllers: {}, authEvents: {}, activeLocationKey: null, expandedNodeIds: new Set(), loading: false, error: null });
    Object.defineProperty(window, 'sero', { configurable: true, value: { agentNodes: {
      list: vi.fn().mockResolvedValue([ipcNode]),
      control: vi.fn().mockImplementation((_nodeId, args) => args.operation === 'listSessions'
        ? Promise.resolve({ sessions: [ipcSession] })
        : Promise.resolve({ ok: true })),
      enrol: vi.fn(), remove: vi.fn(), connect: vi.fn(), send: vi.fn(), cancelTask: vi.fn(),
      attach: vi.fn().mockResolvedValue({ sessionKey: 'node:spark%3Awest:session%3Aone', messages: [], cursor: null }),
      onEvent: vi.fn(),
    } } });
  });

  it('uses reversible location keys that cannot collide across local and remote sessions', () => {
    const local = sessionLocationKey({ kind: 'local', sessionId: 'spark:west:session:one' });
    const remote = sessionLocationKey({ kind: 'node', nodeId: 'spark:west', sessionId: 'session:one' });
    expect(local).not.toBe(remote);
    expect(parseSessionLocationKey(remote)).toEqual({ kind: 'node', nodeId: 'spark:west', sessionId: 'session:one' });
  });

  it('loads each node and its authoritative sessions', async () => {
    await useNodesStore.getState().load();
    expect(useNodesStore.getState().nodes).toEqual([{ ...node, lastSeen: undefined, workspaces: [{ id: 'repo', name: 'repo' }] }]);
    expect(useNodesStore.getState().sessions['spark:west']).toEqual([{
      ...session, name: session.id, model: 'test/opus', taskId: undefined,
    }]);
  });

  it('attaches when a remote session is selected and applies live conversation events', async () => {
    await useNodesStore.getState().selectRemoteSession(node.id, session.id);
    expect(window.sero.agentNodes.attach).toHaveBeenCalledWith(node.id, session.id);
    const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'message_start', sessionId: key, message: { type: 'assistant', id: 'a1', text: 'Hello', isStreaming: true } },
    });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'text_delta', sessionId: key, messageId: 'a1', delta: ' world' },
    });
    expect(useNodesStore.getState().messages[key]).toEqual([{ type: 'assistant', id: 'a1', text: 'Hello world', isStreaming: true }]);
  });

  it('updates only the node named by a session event', () => {
    useNodesStore.setState({ sessions: { other: [] } });
    useNodesStore.getState().handleEvent({ type: 'sessions-changed', nodeId: node.id, sessions: [session] });
    expect(useNodesStore.getState().sessions).toEqual({ other: [], [node.id]: [session] });
  });
});
