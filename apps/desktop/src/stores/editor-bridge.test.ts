// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/stores/app';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';
import { useEditorBridge } from './editor-bridge';

const initialAppState = useAppStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();
const initialExplorerState = useExplorerStore.getState();
const initialEditorBridgeState = useEditorBridge.getState();

describe('useEditorBridge', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        layout: {
          load: vi.fn().mockResolvedValue(null),
          save: vi.fn().mockResolvedValue(undefined),
        },
      } as Partial<typeof window.sero>,
    });

    useAppStore.setState({ ...initialAppState, activeApp: 'dashboard' }, true);
    useWorkspaceStore.setState({ ...initialWorkspaceState, activeWorkspaceId: 'global' }, true);
    useExplorerStore.setState({ ...initialExplorerState, ui: {} }, true);
    useEditorBridge.setState(initialEditorBridgeState, true);
  });

  afterEach(() => {
    useAppStore.setState(initialAppState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useExplorerStore.setState(initialExplorerState, true);
    useEditorBridge.setState(initialEditorBridgeState, true);
    Reflect.deleteProperty(window, 'sero');
  });

  it('focuses the Explorer editor when opening a file from chat', () => {
    useExplorerStore.getState().set('ws-1', {
      activePanel: 'browser',
      sidebarOpen: false,
    });

    useEditorBridge.getState().requestOpenFile('ws-1', '/workspace/recording.mp4');

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1');
    expect(useAppStore.getState().activeApp).toBe('explorer');
    expect(useExplorerStore.getState().get('ws-1')).toMatchObject({
      activePanel: 'explorer',
      sidebarOpen: true,
    });
    expect(useEditorBridge.getState().pendingOpen).toEqual({
      workspaceId: 'ws-1',
      filePath: '/workspace/recording.mp4',
    });
  });
});
