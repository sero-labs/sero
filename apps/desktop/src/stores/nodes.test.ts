import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStreamEvent } from '@/types/agent';
import { agentNodeApi, parseSessionLocationKey, relativeWorkspaceId, sessionLocationKey, useNodesStore } from './nodes';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

const node = {
  id: 'spark:west', name: 'Spark', address: 'https://spark', fingerprint: 'sha256',
  connectionState: 'connected' as const, tools: ['read'], workspaces: [{ id: 'repo', name: 'Repo' }],
};
const session = { id: 'session:one', workspaceId: 'repo', modified: '2026-01-01T00:00:00Z', engine: 'Pi', model: 'opus', thinkingLevel: 'off' as const, approvalMode: 'ask' as const };
const ipcNode = {
  id: node.id, name: node.name, address: node.address, fingerprint: node.fingerprint,
  state: 'connected', lastSeenAt: null, tools: node.tools,
};
const ipcSession = {
  contextId: session.id, name: session.id, workspace: session.workspaceId,
  model: { providerId: 'test', modelId: 'opus' }, thinkingLevel: 'off' as const, approvalMode: 'ask' as const, updatedAt: session.modified, runningTaskId: null,
};

describe('nodes store', () => {
  beforeEach(() => {
    useNodesStore.setState({ nodes: [], sessions: {}, messages: {}, providers: {}, models: {}, controllers: {}, authEvents: {}, artifacts: {}, approvals: {}, preferredModels: {}, activeLocationKey: null, expandedNodeIds: new Set(), loading: false, error: null });
    Object.defineProperty(window, 'sero', { configurable: true, value: { agentNodes: {
      list: vi.fn().mockResolvedValue([ipcNode]),
      control: vi.fn().mockImplementation((_nodeId, args) => args.operation === 'listSessions'
        ? Promise.resolve({ sessions: [ipcSession] })
        : args.operation === 'createSession' ? Promise.resolve({ session: ipcSession })
          : args.operation === 'setSessionApprovalMode' ? Promise.resolve({ session: { ...ipcSession, approvalMode: args.params.approvalMode } })
      : args.operation === 'getProviders' ? Promise.resolve({ oauth: [], apiKey: [], models: [{
        providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true,
        availableThinkingLevels: ['off', 'low', 'medium', 'high'],
      }] })
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
    expect(useNodesStore.getState().preferredModels['spark:west']).toBe('test/opus');
  });

  it('creates a first workspace from a relative path and consumes the model catalogue', async () => {
    useNodesStore.setState({ nodes: [node] });
    await useNodesStore.getState().loadModels(node.id);
    await useNodesStore.getState().createSession(node.id, 'projects/agent-node');
    expect(useNodesStore.getState().models[node.id]).toEqual([{
      providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true,
      availableThinkingLevels: ['off', 'low', 'medium', 'high'],
    }]);
    expect(window.sero.agentNodes.control).toHaveBeenCalledWith(node.id, {
      operation: 'createSession',
      params: { workspace: 'projects/agent-node', model: { providerId: 'anthropic', modelId: 'claude' } },
    });
    expect(() => relativeWorkspaceId('/Users/person/repo')).toThrow('relative path');
    expect(relativeWorkspaceId('/var/lib/sero-node/workspaces/projects/agent-node')).toBe('projects/agent-node');
  });

  it('uses the last selected node model for the next session', async () => {
    useNodesStore.setState({
      nodes: [node],
      sessions: { [node.id]: [{ ...session, model: 'anthropic/claude' }] },
      models: { [node.id]: [
        { providerId: 'anthropic', modelId: 'claude', name: 'Claude', reasoning: true, availableThinkingLevels: ['off', 'high'] },
        { providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5', reasoning: true, availableThinkingLevels: ['off', 'medium', 'high'] },
      ] },
    });
    await useNodesStore.getState().setSessionModel(node.id, session.id, 'openai/gpt-5');
    await useNodesStore.getState().createSession(node.id, 'repo');
    expect(window.sero.agentNodes.control).toHaveBeenCalledWith(node.id, {
      operation: 'createSession',
      params: { workspace: 'repo', model: { providerId: 'openai', modelId: 'gpt-5' } },
    });
    expect(useNodesStore.getState().preferredModels[node.id]).toBe('openai/gpt-5');
  });

  it('persists the selected thinking level for the remote session', async () => {
    useNodesStore.setState({ sessions: { [node.id]: [{ ...session, model: 'anthropic/claude' }] } });
    await useNodesStore.getState().setSessionThinkingLevel(node.id, session.id, 'high');
    expect(window.sero.agentNodes.control).toHaveBeenCalledWith(node.id, {
      operation: 'setSessionThinkingLevel',
      params: { contextId: session.id, thinkingLevel: 'high' },
    });
    expect(useNodesStore.getState().sessions[node.id]?.[0]?.thinkingLevel).toBe('high');
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

  it('shows queued user messages immediately and renders live remote tools', () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'message_start', sessionId: key, message: { type: 'user', id: 'remote:1', text: 'Keep going' } },
    });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'tool_start', sessionId: key, tool: {
        type: 'tool', id: 'tool:1', toolCallId: 'tool-1', toolName: 'bash', input: { command: 'docker pull image' },
        output: null, isError: false, state: 'running',
      } },
    });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'tool_update', sessionId: key, toolCallId: 'tool-1', output: '50%' },
    });
    expect(useNodesStore.getState().messages[key]).toMatchObject([
      { type: 'user', text: 'Keep going' },
      { type: 'tool', toolCallId: 'tool-1', output: '50%', state: 'running', isPartialOutput: true },
    ]);
  });

  it('streams remote write content before tool execution starts', () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
    const conversation = (event: AgentStreamEvent) => useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id, event,
    });
    conversation({ type: 'tool_input_start', sessionId: key, streamKey: 'stream-1', toolName: 'write' });
    conversation({
      type: 'tool_input_delta', sessionId: key, streamKey: 'stream-1',
      delta: 'first\n', replace: false, path: '/src/app.ts',
    });
    conversation({
      type: 'tool_input_delta', sessionId: key, streamKey: 'stream-1',
      delta: 'second\n', replace: false, path: '/src/app.ts',
    });
    conversation({ type: 'tool_input_end', sessionId: key, streamKey: 'stream-1', toolCallId: 'call-1' });
    conversation({ type: 'tool_start', sessionId: key, tool: {
      type: 'tool', id: 'tool:call-1', toolCallId: 'call-1', toolName: 'write',
      input: { path: '/src/app.ts', content: 'first\nsecond\n' },
      output: null, isError: false, state: 'running',
    } });

    expect(useNodesStore.getState().messages[key]).toMatchObject([{
      id: 'tin-stream-1', toolCallId: 'call-1', isStreamingInput: false,
      input: { path: '/src/app.ts', content: 'first\nsecond\n' }, state: 'running',
    }]);
  });

  it('replaces optimistic messages with authoritative replay entries', () => {
    const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
    useNodesStore.setState({ messages: { [key]: [
      { type: 'user', id: 'remote:user', text: 'Start it' },
      { type: 'assistant', id: 'live:assistant', text: 'Starting', isStreaming: false },
    ] } });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'message_start', sessionId: key, message: { type: 'user', id: 'entry-user', text: 'Start it' } },
    });
    useNodesStore.getState().handleEvent({
      type: 'conversation', nodeId: node.id,
      event: { type: 'message_start', sessionId: key, message: { type: 'assistant', id: 'entry-assistant', text: 'Starting', isStreaming: false } },
    });
    expect(useNodesStore.getState().messages[key]?.map((message) => message.id)).toEqual(['entry-user', 'entry-assistant']);
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
    useNodesStore.setState({ sessions: { [node.id]: [session] }, approvals: { [key]: {
      id: 'permission-1', taskId: 'task-1', contextId: session.id, title: 'Run command',
    } } });
    await useNodesStore.getState().respondApproval(node.id, session.id, true, 'session');
    expect(window.sero.agentNodes.send).toHaveBeenCalledWith({
      nodeId: node.id, contextId: session.id, taskId: 'task-1', text: '',
      approval: { id: 'permission-1', approved: true, scope: 'session' },
    });
    expect(useNodesStore.getState().approvals[key]).toBeNull();
    expect(useNodesStore.getState().sessions[node.id]?.[0]?.approvalMode).toBe('allow');
  });

  it('can restore approval prompts for a trusted session', async () => {
    useNodesStore.setState({ sessions: { [node.id]: [{ ...session, approvalMode: 'allow' }] } });
    await useNodesStore.getState().setSessionApprovalMode(node.id, session.id, 'ask');
    expect(window.sero.agentNodes.control).toHaveBeenCalledWith(node.id, {
      operation: 'setSessionApprovalMode', params: { contextId: session.id, approvalMode: 'ask' },
    });
    expect(useNodesStore.getState().sessions[node.id]?.[0]?.approvalMode).toBe('ask');
  });

  it('reads remote artifacts through authenticated IPC before rendering them', async () => {
    const url = await useNodesStore.getState().readArtifact(node.id, {
      id: 'artifact-1', name: 'result.txt', mediaType: 'text/plain', blobId: 'blob-1',
    });
    expect(window.sero.agentNodes.readBlob).toHaveBeenCalledWith(node.id, 'blob-1');
    expect(url).toBe('data:text/plain;base64,QQ==');
  });

  it('clears displayed artifacts for one remote session', () => {
    useNodesStore.setState({ artifacts: { one: [{ id: 'a', name: 'a.txt', mediaType: 'text/plain' }], two: [{ id: 'b', name: 'b.txt', mediaType: 'text/plain' }] } });
    useNodesStore.getState().clearArtifacts('one');
    expect(useNodesStore.getState().artifacts).toEqual({ one: [], two: [{ id: 'b', name: 'b.txt', mediaType: 'text/plain' }] });
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
