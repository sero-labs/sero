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
import { lspBridge } from '@electron/preload/editor/debug-lsp';
import type { ImageGenParams } from '@electron/features/agent/assistants/image-agent';
import { imagegenBridge } from '@electron/preload/integrations/imagegen';
import { pluginsBridge } from '@electron/preload/integrations/plugins';

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

  it('unsubscribes LSP notification listeners with typed event payloads', () => {
    const callback = vi.fn();

    const unsubscribe = lspBridge.onNotification(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      IpcChannels.lsp.notification,
      expect.any(Function),
    );
    const handler = mocks.ipcRenderer.on.mock.calls.at(-1)?.[1];
    expect(handler).toBeTypeOf('function');

    handler?.({}, {
      workspaceId: 'ws-1',
      language: 'typescript',
      notification: { method: 'textDocument/publishDiagnostics', params: { uri: 'file:///app.ts', diagnostics: [] } },
    });
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      language: 'typescript',
      notification: { method: 'textDocument/publishDiagnostics', params: { uri: 'file:///app.ts', diagnostics: [] } },
    });

    unsubscribe();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      IpcChannels.lsp.notification,
      handler,
    );
  });

  it('unsubscribes plugin change listeners with the same handler instance', () => {
    const callback = vi.fn();

    const unsubscribe = pluginsBridge.onChanged(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      IpcChannels.plugins.event,
      expect.any(Function),
    );
    const handler = mocks.ipcRenderer.on.mock.calls.at(-1)?.[1];
    expect(handler).toBeTypeOf('function');

    handler?.({}, { type: 'changed', pluginId: 'todo', reason: 'dev-session-refreshed' });
    expect(callback).toHaveBeenCalledWith({ type: 'changed', pluginId: 'todo', reason: 'dev-session-refreshed' });

    unsubscribe();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      IpcChannels.plugins.event,
      handler,
    );
  });

  it('invokes plugin dev-session CRUD over the shared plugins IPC surface', async () => {
    await pluginsBridge.listDevSessions();
    await pluginsBridge.startDevSession('/tmp/plugin-one');
    await pluginsBridge.refreshDevSession('dev_1');
    await pluginsBridge.stopDevSession('dev_1');

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.plugins.listDevSessions);
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.plugins.startDevSession, '/tmp/plugin-one');
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.plugins.refreshDevSession, 'dev_1');
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.plugins.stopDevSession, 'dev_1');
  });

  it('invokes the surviving imagegen bridge through the imagegen IPC surface', async () => {
    const params: ImageGenParams = {
      prompt: 'Generate a skyline at sunset',
      model: 'gemini-2.5-flash-image',
      variations: 1,
      aspectRatio: '1:1',
    };

    await imagegenBridge.generate('ws-1', params);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.imagegen.generate,
      'ws-1',
      params,
    );
  });
});
