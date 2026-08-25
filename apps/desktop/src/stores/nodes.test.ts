import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentNodeApi, parseSessionLocationKey, relativeWorkspaceId, sessionLocationKey, useNodesStore } from './nodes';

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
    useNodesStore.setState({ nodes: [], sessions: {}, messages: {}, providers: {}, models: {}, controllers: {}, authEvents: {}, artifacts: {}, approvals: {}, activeLocationKey: null, expandedNodeIds: new Set(), loading: false, error: null });
    Object.defineProperty(window, 'sero', { configurable: true, value: { agentNodes: {
      list: vi.fn().mockResolvedValue([ipcNode]),
      control: vi.fn().mockImplementation((_nodeId, args) => args.operation === 'listSessions'
        ? Promise.resolve({ sessions: [ipcSession] })
        : args.operation === 'createSession' ? Promise.resolve({ session: ipcSession })
      : args.operation === 'getProviders' ? Promise.resolve({ oauth: [], apiKey: [], models: [{ providerId: 'anthropic', modelId: 'claude', name: 'Claude' }] })
            : Promise.resolve({ ok: true })),
      enrol: vi.fn(), remove: vi.fn(), connect: vi.fn(), send: vi.fn().mockResolvedValue({ taskId: 'task-1' }), cancelTask: vi.fn(), readBlob: vi.fn().mockResolvedValue(new Uint8Array([65])),
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

  it('creates a first workspace from a relative path and consumes the model catalogue', async () => {
    useNodesStore.setState({ nodes: [node] });
    await useNodesStore.getState().loadModels(node.id);
    await useNodesStore.getState().createSession(node.id, 'projects/agent-node', 'anthropic/claude');
    expect(useNodesStore.getState().models[node.id]).toEqual([{ providerId: 'anthropic', modelId: 'claude', name: 'Claude' }]);
    expect(window.sero.agentNodes.control).toHaveBeenCalledWith(node.id, {
      operation: 'createSession',
      params: { workspace: 'projects/agent-node', model: { providerId: 'anthropic', modelId: 'claude' } },
    });
    expect(() => relativeWorkspaceId('/Users/person/repo')).toThrow('relative path');
    expect(relativeWorkspaceId('/var/lib/sero-node/workspaces/projects/agent-node')).toBe('projects/agent-node');
  });

  it('attaches when a remote session is selected and applies live conversation events', async () => {
    useNodesStore.setState({ sessions: { [node.id]: [{ ...session, taskId: 'task-1' }] } });
    await useNodesStore.getState().selectRemoteSession(node.id, session.id);
    expect(window.sero.agentNodes.attach).toHaveBeenCalledWith(node.id, session.id, undefined, 'task-1');
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

  it('keeps the returned task active so send can be cancelled', async () => {
    useNodesStore.setState({ sessions: { [node.id]: [session] } });
    await useNodesStore.getState().sendMessage(node.id, session.id, 'Hello');
    expect(useNodesStore.getState().sessions[node.id]?.[0]?.taskId).toBe('task-1');
    await useNodesStore.getState().cancelTask(node.id, 'task-1');
    expect(window.sero.agentNodes.cancelTask).toHaveBeenCalledWith(node.id, 'task-1');
    expect(useNodesStore.getState().sessions[node.id]?.[0]?.taskId).toBeUndefined();
  });

  it('sends and clears an approval decision through the active task', async () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
    useNodesStore.setState({ approvals: { [key]: {
      id: 'permission-1', taskId: 'task-1', contextId: session.id, title: 'Run command',
    } } });
    await useNodesStore.getState().respondApproval(node.id, session.id, true);
    expect(window.sero.agentNodes.send).toHaveBeenCalledWith({
      nodeId: node.id, contextId: session.id, taskId: 'task-1', text: '',
      approval: { id: 'permission-1', approved: true },
    });
    expect(useNodesStore.getState().approvals[key]).toBeNull();
  });

  it('reads remote artifacts through authenticated IPC before rendering them', async () => {
    const url = await useNodesStore.getState().readArtifact(node.id, {
      id: 'artifact-1', name: 'result.txt', mediaType: 'text/plain', blobId: 'blob-1',
    });
    expect(window.sero.agentNodes.readBlob).toHaveBeenCalledWith(node.id, 'blob-1');
    expect(url).toBe('data:text/plain;base64,QQ==');
  });

  it('forwards approval and artifact IPC events to the renderer store boundary', () => {
    const listener = vi.fn();
    agentNodeApi().subscribe(listener);
    const onEvent = vi.mocked(window.sero.agentNodes.onEvent);
    const callback = onEvent.mock.calls[0]?.[0];
    const approval = { type: 'approval', nodeId: node.id, sessionKey: 'node:key', approval: {
      id: 'permission-1', taskId: 'task-1', contextId: session.id, title: 'Approve',
    } } as const;
    callback?.(approval);
    expect(listener).toHaveBeenCalledWith(approval);
  });

  it('updates only the node named by a session event', () => {
    useNodesStore.setState({ sessions: { other: [] } });
    useNodesStore.getState().handleEvent({ type: 'sessions-changed', nodeId: node.id, sessions: [session] });
    expect(useNodesStore.getState().sessions).toEqual({ other: [], [node.id]: [session] });
  });
});
