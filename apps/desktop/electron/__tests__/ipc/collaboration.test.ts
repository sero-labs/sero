import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationResult } from '@/types/collaboration';
import { IpcChannels } from '@/types/ipc-channels';

type CollaborationPromptHandler = (
  event: unknown,
  sessionId: string,
  workspaceId: string,
  query: string,
  config?: unknown,
) => Promise<CollaborationResult>;

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const webContentsSend = vi.fn();
  const getAllWindows = vi.fn(() => [{ webContents: { send: webContentsSend } }]);

  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    getAllWindows,
    webContentsSend,
    runCollaboration: vi.fn(),
    runDebateCollaboration: vi.fn(),
    getAgentPoolEntry: vi.fn(),
    emitAgentEvent: vi.fn(),
    nextId: vi.fn(() => 'user-1'),
    applyCollaborationRuntimeEvent: vi.fn(),
    createCollaborationRuntimeSnapshot: vi.fn(() => ({ status: 'research' })),
    getCollaborationRuntimeSnapshot: vi.fn(() => null),
    setCollaborationRuntimeSnapshot: vi.fn(),
    subagentManager: { isInitialized: true },
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
}));

vi.mock('@electron/features/collaboration', () => ({
  runCollaboration: mocks.runCollaboration,
}));

vi.mock('@electron/features/collaboration/debate', () => ({
  runDebateCollaboration: mocks.runDebateCollaboration,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  subagentManager: mocks.subagentManager,
}));

vi.mock('../../ipc/agent', () => ({
  getAgentPoolEntry: mocks.getAgentPoolEntry,
  emitAgentEvent: mocks.emitAgentEvent,
}));

vi.mock('../../ipc/agent/core/agent-helpers', () => ({
  nextId: mocks.nextId,
}));

vi.mock('../../ipc/collaboration/runtime-state', () => ({
  applyCollaborationRuntimeEvent: mocks.applyCollaborationRuntimeEvent,
  createCollaborationRuntimeSnapshot: mocks.createCollaborationRuntimeSnapshot,
  getCollaborationRuntimeSnapshot: mocks.getCollaborationRuntimeSnapshot,
  setCollaborationRuntimeSnapshot: mocks.setCollaborationRuntimeSnapshot,
}));

describe('registerCollaborationHandlers', () => {
  const result: CollaborationResult = {
    finalResponse: 'Synthesized answer',
    specialistOutputs: [],
    totalDurationMs: 1234,
    hasErrors: false,
  };

  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.getAllWindows.mockClear();
    mocks.getAllWindows.mockReturnValue([{ webContents: { send: mocks.webContentsSend } }]);
    mocks.webContentsSend.mockReset();
    mocks.runCollaboration.mockReset();
    mocks.runDebateCollaboration.mockReset();
    mocks.getAgentPoolEntry.mockReset();
    mocks.emitAgentEvent.mockReset();
    mocks.nextId.mockReset().mockReturnValue('user-1');
    mocks.applyCollaborationRuntimeEvent.mockReset();
    mocks.createCollaborationRuntimeSnapshot.mockReset().mockReturnValue({ status: 'research' });
    mocks.getCollaborationRuntimeSnapshot.mockReset().mockReturnValue(null);
    mocks.setCollaborationRuntimeSnapshot.mockReset();
    mocks.subagentManager.isInitialized = true;
  });

  it('emits collab_end only after the final injection prompt resolves', async () => {
    const steps: string[] = [];
    mocks.webContentsSend.mockImplementation((_channel, event: { type: string }) => {
      steps.push(event.type);
    });
    mocks.runCollaboration.mockResolvedValue(result);
    const sessionPrompt = vi.fn(async () => {
      steps.push('prompt');
    });
    mocks.getAgentPoolEntry.mockReturnValue({
      session: {
        messages: [],
        prompt: sessionPrompt,
      },
      pendingTurnUndoUserMessageId: null,
    });

    const { registerCollaborationHandlers } = await import('../../ipc/collaboration/collaboration');
    registerCollaborationHandlers();

    const handler = mocks.handlers.get(
      IpcChannels.collaboration.prompt,
    ) as CollaborationPromptHandler;

    await expect(
      handler({}, 'session-1', 'workspace-1', 'Investigate the regression'),
    ).resolves.toEqual(result);

    expect(steps).toEqual(['collab_start', 'prompt', 'collab_end']);
  });

  it('preserves the error path by skipping collab_end when the final injection prompt fails', async () => {
    const injectionError = new Error('injection failed');
    mocks.runCollaboration.mockResolvedValue(result);
    mocks.getAgentPoolEntry.mockReturnValue({
      session: {
        messages: [],
        prompt: vi.fn().mockRejectedValue(injectionError),
      },
      pendingTurnUndoUserMessageId: null,
    });

    const { registerCollaborationHandlers } = await import('../../ipc/collaboration/collaboration');
    registerCollaborationHandlers();

    const handler = mocks.handlers.get(
      IpcChannels.collaboration.prompt,
    ) as CollaborationPromptHandler;

    await expect(
      handler({}, 'session-1', 'workspace-1', 'Investigate the regression'),
    ).rejects.toThrow('injection failed');

    const collabEventTypes = mocks.webContentsSend.mock.calls.map(
      ([, event]) => (event as { type: string }).type,
    );
    expect(collabEventTypes).toEqual(['collab_start', 'collab_error']);
    expect(
      mocks.applyCollaborationRuntimeEvent.mock.calls.map(
        ([event]) => (event as { type: string }).type,
      ),
    ).toEqual(['collab_start', 'collab_error']);
  });
});
