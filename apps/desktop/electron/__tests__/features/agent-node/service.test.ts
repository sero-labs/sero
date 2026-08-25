import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentNodeService } from '@electron/features/agent-node/service';

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
  controlCall: vi.fn(),
}));

vi.mock('electron', () => ({ safeStorage: {}, shell: { openExternal: vi.fn() } }));
vi.mock('@electron/features/agent-node/registry', () => ({
  AgentNodeRegistry: class {
    list = vi.fn().mockResolvedValue([{
      id: 'node-1', name: 'Spark', address: 'https://spark.test', fingerprint: 'ab'.repeat(32),
      controlUrl: 'https://spark.test/sero/v1', tools: ['read'], createdAt: '2026-01-01T00:00:00Z',
    }]);
  },
}));
vi.mock('@electron/features/agent-node/credentials', () => ({
  AgentNodeCredentials: class { get = vi.fn().mockResolvedValue('token') },
}));
vi.mock('@electron/features/agent-node/pinned-transport', () => ({
  PinnedTransport: class { dispose = vi.fn() },
}));
vi.mock('@electron/features/agent-node/agent-card', () => ({
  activateAgentCard: vi.fn().mockResolvedValue({
    a2aUrl: 'https://spark.test', controlUrl: 'https://spark.test/sero/v1', tools: ['read'],
  }),
}));
vi.mock('@electron/features/agent-node/a2a-client', () => ({
  A2aClient: class {
    streamMessage = mocks.streamMessage;
    getTask = mocks.getTask;
    cancelTask = mocks.cancelTask;
  },
}));
vi.mock('@electron/features/agent-node/control-client', () => ({
  ControlAuthorizationError: class extends Error {},
  ControlVersionError: class extends Error {},
  ControlClient: class {
    call = mocks.controlCall;
    stream = vi.fn();
    sessionEvents = vi.fn();
  },
}));
vi.mock('@electron/features/agent-node/retrying-stream', () => ({
  RetryingStream: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    getCursor = vi.fn().mockReturnValue(null);
  },
}));

describe('AgentNodeService task lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamMessage.mockImplementation(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: {
        result: { task: { id: 'task-1', contextId: 'session-1', status: { state: 'TASK_STATE_WORKING' } } },
      } });
      return { close: vi.fn(), done: new Promise<void>(() => {}) };
    });
  });

  it('returns the active task id from the first streaming task event and cancels it', async () => {
    const service = new AgentNodeService('/profile');
    const result = await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await service.cancelTask('node-1', result.taskId);
    expect(result).toEqual({ taskId: 'task-1' });
    expect(mocks.cancelTask).toHaveBeenCalledWith('task-1');
  });

  it('calls GetTask on attach and reports a node restart', async () => {
    mocks.getTask.mockResolvedValue({
      id: 'task-1', status: { state: 'TASK_STATE_FAILED', message: { parts: [{ text: 'the node restarted' }] } },
    });
    const service = new AgentNodeService('/profile');
    const events: unknown[] = [];
    service.subscribe((event) => events.push(event));
    await service.attach('node-1', 'session-1', undefined, 'task-1');
    expect(mocks.getTask).toHaveBeenCalledWith('task-1');
    expect(events).toContainEqual({ type: 'connection', nodeId: 'node-1', state: 'restarted' });
  });

  it('reconciles the active task with GetTask when its stream reconnects', async () => {
    mocks.getTask.mockResolvedValue({ id: 'task-1', status: { state: 'TASK_STATE_WORKING' } });
    mocks.streamMessage.mockImplementation(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: {
        result: { task: { id: 'task-1', contextId: 'session-1', status: { state: 'TASK_STATE_WORKING' } } },
      } });
      return { close: vi.fn(), done: Promise.resolve() };
    });
    const service = new AgentNodeService('/profile');
    const events: unknown[] = [];
    service.subscribe((event) => events.push(event));
    await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await vi.waitFor(() => expect(mocks.getTask).toHaveBeenCalledWith('task-1'));
    expect(events).toContainEqual({ type: 'connection', nodeId: 'node-1', state: 'reconnecting' });
    expect(events).toContainEqual({ type: 'connection', nodeId: 'node-1', state: 'connected' });
  });

  it('emits an approval request carried by INPUT_REQUIRED data', async () => {
    mocks.streamMessage.mockImplementation(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: { result: { task: {
        id: 'task-1', contextId: 'session-1', status: {
          state: 'TASK_STATE_INPUT_REQUIRED',
          message: { parts: [{ data: { approvalId: 'permission-1', toolName: 'bash', input: { command: 'pnpm test' } } }] },
        },
      } } } });
      return { close: vi.fn(), done: new Promise<void>(() => {}) };
    });
    const service = new AgentNodeService('/profile');
    const events: unknown[] = [];
    service.subscribe((event) => events.push(event));
    await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Test' });
    expect(events).toContainEqual({
      type: 'approval', nodeId: 'node-1', sessionKey: 'node:node-1:session-1',
      approval: { id: 'permission-1', taskId: 'task-1', contextId: 'session-1', title: 'Allow bash', description: '{"command":"pnpm test"}' },
    });
  });
});
