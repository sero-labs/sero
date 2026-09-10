// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));
vi.mock('@/lib/open-app', () => ({ openApp: vi.fn() }));
vi.mock('@/lib/app-control/dom-interactions', () => ({
  executeAppInteraction: vi.fn(),
  getAppPanelRect: vi.fn(() => null),
}));
vi.mock('@/lib/app-control/dom/full-screenshot', () => ({
  prepareFullScreenshot: vi.fn(),
  restoreFullScreenshotScroll: vi.fn(),
  setFullScreenshotScroll: vi.fn(),
  stitchFullScreenshot: vi.fn(),
}));

import { openApp } from '@/lib/open-app';
import { initAppControlBridge } from './app-control-bridge';
import { useAppStore } from '@/stores/app';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';

const WORKSPACE = 'ws-1';

describe('app control bridge — openFile', () => {
  beforeEach(() => {
    initAppControlBridge();
    useWorkspaceStore.setState({ activeWorkspaceId: WORKSPACE });
    useAppStore.setState({ activeApp: 'explorer' });
  });

  // Plugin git surfaces open files through `openSeroFile`, which lands here.
  // A contributed view fills the Explorer area, so without this the file would
  // open behind it and nothing would appear to happen.
  it('reveals the editor when a plugin view owns the Explorer area', () => {
    useExplorerStore.getState().set(WORKSPACE, { activePanel: 'git-plugin', sidebarOpen: false });

    window.__appControl!.openFile(WORKSPACE, '/repo/src/index.ts');

    const explorer = useExplorerStore.getState().get(WORKSPACE);
    expect(explorer.activePanel).toBe('explorer');
    expect(explorer.sidebarOpen).toBe(true);
    expect(useEditorBridge.getState().pendingOpen?.filePath).toBe('/repo/src/index.ts');
  });
});


describe('app control workspace navigation', () => {
  beforeEach(() => {
    vi.mocked(openApp).mockClear();
    initAppControlBridge();
    useAppStore.setState({ apps: [{ id: 'orchestrator', label: 'Orchestrator', icon: 'box', builtin: false, manifest: null }] });
    useWorkspaceStore.setState({
      activeWorkspaceId: 'previous',
      workspaces: [{ id: 'target', name: 'Target', path: '/target', open: true,
        runtime: { backend: 'host' }, container: false, references: [], mounts: [], roots: [] }],
    });
  });

  it('selects the dispatched workspace before opening its app', () => {
    vi.mocked(openApp).mockImplementationOnce(() => {
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('target');
    });
    expect(window.__appControl!.openApp('orchestrator', 'target')).toBe(true);
    expect(openApp).toHaveBeenCalledWith('orchestrator');
  });

  it('refuses an unknown workspace without opening the wrong project', () => {
    expect(window.__appControl!.openApp('orchestrator', 'missing')).toBe(false);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('previous');
    expect(openApp).not.toHaveBeenCalled();
  });
});
