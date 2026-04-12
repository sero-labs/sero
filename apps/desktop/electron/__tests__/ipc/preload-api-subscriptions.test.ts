import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

import { agentBridge } from '@electron/preload/api/core';
import { filetreeBridge, vcsBridge } from '@electron/preload/api/workbench';

describe('preload event bridge subscriptions', () => {
  beforeEach(() => {
    mocks.ipcRenderer.invoke.mockReset();
    mocks.ipcRenderer.on.mockReset();
    mocks.ipcRenderer.removeListener.mockReset();
  });

  it('unsubscribes agent event listeners with the same handler instance', () => {
    const callback = vi.fn();

    const unsubscribe = agentBridge.onEvent(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      IpcChannels.agent.event,
      expect.any(Function),
    );
    const handler = mocks.ipcRenderer.on.mock.calls.at(-1)?.[1];
    expect(handler).toBeTypeOf('function');

    handler?.({}, { type: 'agent_start', sessionId: 'session-1' });
    expect(callback).toHaveBeenCalledWith({ type: 'agent_start', sessionId: 'session-1' });

    unsubscribe();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      IpcChannels.agent.event,
      handler,
    );
  });

  it('unsubscribes VCS event listeners with the same handler instance', () => {
    const callback = vi.fn();

    const unsubscribe = vcsBridge.onEvent(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      IpcChannels.vcs.event,
      expect.any(Function),
    );
    const handler = mocks.ipcRenderer.on.mock.calls.at(-1)?.[1];
    expect(handler).toBeTypeOf('function');

    handler?.({}, { type: 'status', workspaceId: 'ws-1' });
    expect(callback).toHaveBeenCalledWith({ type: 'status', workspaceId: 'ws-1' });

    unsubscribe();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      IpcChannels.vcs.event,
      handler,
    );
  });

  it('unsubscribes filetree change listeners with the same handler instance', () => {
    const callback = vi.fn();

    const unsubscribe = filetreeBridge.onChanged(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      IpcChannels.filetree.changed,
      expect.any(Function),
    );
    const handler = mocks.ipcRenderer.on.mock.calls.at(-1)?.[1];
    expect(handler).toBeTypeOf('function');

    handler?.({}, { workspaceId: 'ws-1', directories: ['/workspace/src'] });
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      directories: ['/workspace/src'],
    });

    unsubscribe();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      IpcChannels.filetree.changed,
      handler,
    );
  });
});
