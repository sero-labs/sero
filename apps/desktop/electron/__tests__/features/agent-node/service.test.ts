import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentNodeService } from '@electron/features/agent-node/service';

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
  controlCall: vi.fn(),
  sessionEvents: vi.fn(),
  streamClose: vi.fn(),
  openExternal: vi.fn(),
  retryError: undefined as Error | undefined,
  retryMessages: [] as Array<{ id: string | null; event: string; data: unknown }>,
}));

vi.mock('electron', () => ({ safeStorage: {}, shell: { openExternal: mocks.openExternal } }));
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
  ControlNotFoundError: class extends Error {},
  ControlVersionError: class extends Error {},
  ControlClient: class {
    call = mocks.controlCall;
    stream = vi.fn();
    sessionEvents = mocks.sessionEvents;
  },
}));
vi.mock('@electron/features/agent-node/retrying-stream', () => ({
  RetryingStream: class {
    constructor(
      _open: unknown,
      private readonly onMessage: (message: { id: string | null; event: string; data: unknown }) => void,
    ) {}
    start = vi.fn(async () => {
      if (mocks.retryError) throw mocks.retryError;
      for (const message of mocks.retryMessages) this.onMessage(message);
      return new Promise<void>(() => {});
    });
    stop = vi.fn();
    getCursor = vi.fn().mockReturnValue(null);
  },
}));

describe('AgentNodeService task lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retryError = undefined;
    mocks.retryMessages.splice(0, mocks.retryMessages.length, { id: null, event: 'synced', data: { type: 'synced' } });
    mocks.streamMessage.mockImplementation(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: {
        result: { task: { id: 'task-1', contextId: 'session-1', status: { state: 'TASK_STATE_WORKING' } } },
      } });
      return { close: mocks.streamClose, done: new Promise<void>(() => {}) };
    });
  });

  it('returns the active task id from the first streaming task event and cancels it', async () => {
    const service = new AgentNodeService('/profile');
    const events: unknown[] = [];
    service.subscribe((event) => events.push(event));
    const result = await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await service.cancelTask('node-1', result.taskId);
    expect(result).toEqual({ taskId: 'task-1' });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'conversation', nodeId: 'node-1',
      event: expect.objectContaining({ type: 'message_start', message: expect.objectContaining({ type: 'user', text: 'Hello' }) }),
    }));
    expect(mocks.cancelTask).toHaveBeenCalledWith('task-1');
  });

  it('does not open a second replay stream when a task stream completes', async () => {
    mocks.streamMessage.mockImplementationOnce(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: {
        result: { task: { id: 'task-1', contextId: 'session-1', status: { state: 'TASK_STATE_COMPLETED' } } },
      } });
      return { close: vi.fn(), done: Promise.resolve() };
    });
    const service = new AgentNodeService('/profile');
    await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await Promise.resolve();
    expect(mocks.sessionEvents).not.toHaveBeenCalled();
  });

  it('rejects send when the task stream closes before returning a task id', async () => {
    mocks.streamMessage.mockResolvedValueOnce({ close: mocks.streamClose, done: Promise.resolve() });
    const service = new AgentNodeService('/profile');

    await expect(service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' }))
      .rejects.toThrow('closed before it returned a task');
  });

  it('removes completed task streams from the connection', async () => {
    mocks.streamMessage.mockImplementationOnce(async (_params, onEvent) => {
      onEvent({ id: null, event: 'message', data: {
        result: { task: { id: 'task-1', contextId: 'session-1', status: { state: 'TASK_STATE_COMPLETED' } } },
      } });
      return { close: mocks.streamClose, done: Promise.resolve() };
    });
    const service = new AgentNodeService('/profile');

    await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await Promise.resolve();
    service.dispose();

    expect(mocks.streamClose).not.toHaveBeenCalled();
  });

  it('opens only HTTP provider authentication URLs', async () => {
    mocks.retryMessages.splice(0, mocks.retryMessages.length,
      { id: null, event: 'auth', data: { type: 'auth', url: 'file:///etc/passwd' } },
      { id: null, event: 'auth', data: { type: 'auth', url: 'https://provider.test/login' } },
    );
    const service = new AgentNodeService('/profile');

    await service.send({ nodeId: 'node-1', contextId: 'session-1', text: 'Hello' });
    await vi.waitFor(() => expect(mocks.openExternal).toHaveBeenCalledTimes(1));

    expect(mocks.openExternal).toHaveBeenCalledWith('https://provider.test/login');
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

  it('waits for the initial replay batch before returning messages', async () => {
    mocks.retryMessages.splice(0, mocks.retryMessages.length,
      { id: '1234abcd', event: 'entry', data: {
        type: 'entry', entry: { id: '1234abcd', parentId: null, data: { role: 'user', text: 'Hello from replay' } },
      } },
      { id: null, event: 'synced', data: { type: 'synced' } },
    );
    const service = new AgentNodeService('/profile');
    const attached = await service.attach('node-1', 'session-1');
    expect(attached.messages).toHaveLength(1);
    expect(attached.messages[0]).toMatchObject({ type: 'user', text: 'Hello from replay' });
  });

  it('rejects attach when the session replay cannot be opened', async () => {
    mocks.retryError = new Error('Session not found');
    const service = new AgentNodeService('/profile');

    await expect(service.attach('node-1', 'deleted-session')).rejects.toThrow('Session not found');
  });

  it('reconciles a completed task stream without resetting the connection', async () => {
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
    expect(events).not.toContainEqual({ type: 'connection', nodeId: 'node-1', state: 'reconnecting' });
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
