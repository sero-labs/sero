// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useEditorBridge } from '@/stores/editor-bridge';
import type { SeroEditorAPI } from '@/types/electron-workspace';
import { useExplorerEditorState } from './useExplorerEditorState';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialEditorBridgeState = useEditorBridge.getState();

describe('useExplorerEditorState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestState: ReturnType<typeof useExplorerEditorState> | null = null;

  const loadState = vi.fn<SeroEditorAPI['loadState']>(async () => null);
  const saveState = vi.fn<SeroEditorAPI['saveState']>(async () => {});

  function Harness({ workspaceId }: { workspaceId: string }) {
    latestState = useExplorerEditorState(workspaceId);
    return null;
  }

  beforeEach(() => {
    latestState = null;
    loadState.mockReset();
    saveState.mockReset();
    useEditorBridge.setState(initialEditorBridgeState, true);

    const editorApi: SeroEditorAPI = {
      readFile: vi.fn(async () => ''),
      readBinaryFile: vi.fn(async () => ''),
      writeFile: vi.fn(async () => {}),
      listFiles: vi.fn(async () => []),
      exec: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      saveState,
      loadState,
      getRootPath: vi.fn(async () => '/workspace'),
      getRoots: vi.fn(async () => []),
      isContainer: vi.fn(async () => false),
      rename: vi.fn(async () => true),
      delete: vi.fn(async () => true),
      createFile: vi.fn(async () => true),
      createDir: vi.fn(async () => true),
    };

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        editor: editorApi,
      } as Partial<typeof window.sero>,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    latestState = null;
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    useEditorBridge.setState(initialEditorBridgeState, true);
  });

  it('merges a pending bridge open request into restored workspace state', async () => {
    loadState.mockResolvedValue({
      openTabs: ['/workspace/already-open.ts'],
      activeTab: '/workspace/already-open.ts',
    });
    useEditorBridge.setState({
      pendingOpen: {
        workspaceId: 'ws-1',
        filePath: '/workspace/from-bridge.ts',
      },
    });

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestState?.editorTabs).toEqual([
        '/workspace/already-open.ts',
        '/workspace/from-bridge.ts',
      ]);
    });
    expect(latestState?.activeTab).toBe('/workspace/from-bridge.ts');
    expect(useEditorBridge.getState().pendingOpen).toBeNull();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalledWith('ws-1', {
        openTabs: ['/workspace/already-open.ts', '/workspace/from-bridge.ts'],
        activeTab: '/workspace/from-bridge.ts',
      });
    });
  });

  it('opens later bridge requests once the workspace state is ready', async () => {
    loadState.mockResolvedValue(null);

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(loadState).toHaveBeenCalledWith('ws-1');
    });

    act(() => {
      useEditorBridge.getState().requestOpenFile('ws-1', '/workspace/chat-open.ts');
    });

    await vi.waitFor(() => {
      expect(latestState?.editorTabs).toEqual(['/workspace/chat-open.ts']);
    });
    expect(latestState?.activeTab).toBe('/workspace/chat-open.ts');
    expect(useEditorBridge.getState().pendingOpen).toBeNull();
  });

  it('remaps and prunes editor tabs when file tree paths change', async () => {
    loadState.mockResolvedValue({
      openTabs: ['/workspace/src/file.ts', '/workspace/keep.ts'],
      activeTab: '/workspace/src/file.ts',
    });

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestState?.editorTabs).toEqual([
        '/workspace/src/file.ts',
        '/workspace/keep.ts',
      ]);
    });

    act(() => {
      latestState?.handlePathChanged('/workspace/src', '/workspace/lib');
    });

    expect(latestState?.editorTabs).toEqual([
      '/workspace/lib/file.ts',
      '/workspace/keep.ts',
    ]);
    expect(latestState?.activeTab).toBe('/workspace/lib/file.ts');

    act(() => {
      latestState?.handleDeleted('/workspace/lib');
    });

    expect(latestState?.editorTabs).toEqual(['/workspace/keep.ts']);
    expect(latestState?.activeTab).toBe('/workspace/keep.ts');
  });
});
