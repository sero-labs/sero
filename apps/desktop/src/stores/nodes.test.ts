import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSessionLocationKey, sessionLocationKey, useNodesStore } from './nodes';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

const node = {
  id: 'spark:west', name: 'Spark', address: 'https://spark', fingerprint: 'sha256',
  connectionState: 'connected' as const, tools: ['read'], workspaces: [{ id: 'repo', name: 'Repo' }],
};
const session = { id: 'session:one', workspaceId: 'repo', modified: '2026-01-01T00:00:00Z', engine: 'Pi', model: 'opus' };

describe('nodes store', () => {
  beforeEach(() => {
    useNodesStore.setState({ nodes: [], sessions: {}, messages: {}, providers: {}, controllers: {}, activeLocationKey: null, expandedNodeIds: new Set(), loading: false, error: null });
    Object.defineProperty(window, 'sero', { configurable: true, value: { agentNode: {
      listNodes: vi.fn().mockResolvedValue([node]), listSessions: vi.fn().mockResolvedValue([session]),
      enrolNode: vi.fn(), removeNode: vi.fn(), retryNode: vi.fn(), subscribe: vi.fn(),
      createSession: vi.fn(), deleteSession: vi.fn(), sendMessage: vi.fn(), cancelTask: vi.fn(),
      getProviders: vi.fn(), login: vi.fn(), logout: vi.fn(), setApiKey: vi.fn(), removeApiKey: vi.fn(),
      setSessionModel: vi.fn(), listControllers: vi.fn(), mintEnrolmentCode: vi.fn(), revokeController: vi.fn(),
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
    expect(useNodesStore.getState().nodes).toEqual([node]);
    expect(useNodesStore.getState().sessions['spark:west']).toEqual([session]);
  });

  it('updates only the node named by a session event', () => {
    useNodesStore.setState({ sessions: { other: [] } });
    useNodesStore.getState().handleEvent({ type: 'sessions-changed', nodeId: node.id, sessions: [session] });
    expect(useNodesStore.getState().sessions).toEqual({ other: [], [node.id]: [session] });
  });
});
