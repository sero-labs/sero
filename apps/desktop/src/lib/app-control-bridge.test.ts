// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { getAppPanelRect } from '@/lib/app-control/dom-interactions';
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

describe('app control bridge — recording cursor', () => {
  beforeEach(() => {
    vi.mocked(getAppPanelRect).mockReturnValue({ x: 0, y: 0, width: 320, height: 180 });
    initAppControlBridge();
  });

  afterEach(() => {
    window.__appControl?.recordStop();
    vi.useRealTimers();
  });

  it('shows the cursor before the first recorded movement and follows later movement', () => {
    expect(window.__appControl!.recordStart()).toBe(true);

    const cursor = document.querySelector<HTMLElement>('[data-sero-recording-cursor]');
    expect(cursor).not.toBeNull();
    expect(cursor?.style.display).toBe('block');
    expect(cursor?.style.transform).toBe('translate(160px, 90px)');

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 80 }));
    expect(cursor?.style.transform).toBe('translate(40px, 80px)');

    expect(window.__appControl!.recordStop()).toBe(true);
    expect(document.querySelector('[data-sero-recording-cursor]')).toBeNull();
  });

  it('shows a short pulse at each click while recording', () => {
    vi.useFakeTimers();
    expect(window.__appControl!.recordStart()).toBe(true);

    window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 120, clientY: 160 }));

    const highlight = document.querySelector<HTMLElement>('[data-sero-recording-click]');
    expect(highlight).not.toBeNull();
    expect(highlight?.style.left).toBe('120px');
    expect(highlight?.style.top).toBe('160px');
    expect(highlight?.style.border).toBe('2px solid rgb(113, 185, 255)');

    vi.advanceTimersByTime(700);
    expect(document.querySelector('[data-sero-recording-click]')).toBeNull();
    expect(window.__appControl!.recordStop()).toBe(true);
  });
});
