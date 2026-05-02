// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroEditorAPI } from '@/types/electron-workspace';
import { useEditorDocumentState } from './useEditorDocumentState';
import type { EditorDocumentMonacoBridge } from './editor-panel-shared';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  onOpenTab?: (path: string) => void;
  onCloseTab?: (path: string) => void;
  onCloseOtherTabs?: (path: string) => void;
  onCloseAllTabs?: () => void;
  sendDidSave?: () => void;
  monacoBridge: EditorDocumentMonacoBridge;
}

describe('useEditorDocumentState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestState: ReturnType<typeof useEditorDocumentState> | null = null;

  const readFile = vi.fn<SeroEditorAPI['readFile']>(async () => 'const value = 1;');
  const writeFile = vi.fn<SeroEditorAPI['writeFile']>(async () => {});
  const onOpenTab = vi.fn<(path: string) => void>();
  const onCloseTab = vi.fn<(path: string) => void>();
  const onCloseOtherTabs = vi.fn<(path: string) => void>();
  const onCloseAllTabs = vi.fn<() => void>();
  const sendDidSave = vi.fn<() => void>();
  const monacoBridge: EditorDocumentMonacoBridge = {
    schedulePendingGoto: vi.fn(),
    saveViewState: vi.fn(),
    getCurrentModelContent: vi.fn(() => 'const cached = 2;'),
    disposeModel: vi.fn(),
    clearEditorForPreview: vi.fn(),
  };

  function Harness({
    workspaceId,
    tabs,
    activeTab,
    onOpenTab: openTab = onOpenTab,
    onCloseTab: closeTab = onCloseTab,
    onCloseOtherTabs: closeOtherTabs = onCloseOtherTabs,
    onCloseAllTabs: closeAllTabs = onCloseAllTabs,
    sendDidSave: didSave = sendDidSave,
    monacoBridge: bridge,
  }: HarnessProps) {
    latestState = useEditorDocumentState({
      workspaceId,
      tabs,
      activeTab,
      onOpenTab: openTab,
      onCloseTab: closeTab,
      onCloseOtherTabs: closeOtherTabs,
      onCloseAllTabs: closeAllTabs,
      sendDidSave: didSave,
      monacoBridge: bridge,
    });
    return null;
  }

  beforeEach(() => {
    latestState = null;
    readFile.mockClear();
    writeFile.mockClear();
    onOpenTab.mockReset();
    onCloseTab.mockReset();
    onCloseOtherTabs.mockReset();
    onCloseAllTabs.mockReset();
    sendDidSave.mockReset();
    vi.mocked(monacoBridge.schedulePendingGoto).mockReset();
    vi.mocked(monacoBridge.saveViewState).mockReset();
    vi.mocked(monacoBridge.getCurrentModelContent).mockReset();
    vi.mocked(monacoBridge.getCurrentModelContent).mockReturnValue('const cached = 2;');
    vi.mocked(monacoBridge.disposeModel).mockReset();
    vi.mocked(monacoBridge.clearEditorForPreview).mockReset();

    const editorApi: SeroEditorAPI = {
      readFile,
      readBinaryFile: vi.fn(async () => ''),
      writeFile,
      listFiles: vi.fn(async () => []),
      exec: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      saveState: vi.fn(async () => {}),
      loadState: vi.fn(async () => null),
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
  });

  it('loads file content, tracks dirty state, and saves through the editor bridge', async () => {
    await act(async () => {
      root?.render(
        <Harness
          workspaceId="ws-1"
          tabs={['/workspace/file.ts']}
          activeTab="/workspace/file.ts"
          monacoBridge={monacoBridge}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(latestState?.content).toBe('const value = 1;');
    });
    expect(latestState?.language).toBe('typescript');
    expect(monacoBridge.schedulePendingGoto).toHaveBeenCalledWith('/workspace/file.ts');

    act(() => {
      latestState?.handleChange('const value = 2;');
    });

    expect(latestState?.dirtyPaths.has('/workspace/file.ts')).toBe(true);

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(writeFile).toHaveBeenCalledWith('ws-1', '/workspace/file.ts', 'const value = 2;');
    expect(sendDidSave).toHaveBeenCalledTimes(1);
    expect(latestState?.dirtyPaths.has('/workspace/file.ts')).toBe(false);
  });

  it('preserves active-tab view state and cached model content before opening another tab', async () => {
    await act(async () => {
      root?.render(
        <Harness
          workspaceId="ws-1"
          tabs={['/workspace/file.ts', '/workspace/other.ts']}
          activeTab="/workspace/file.ts"
          monacoBridge={monacoBridge}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(latestState?.content).toBe('const value = 1;');
    });

    act(() => {
      latestState?.handleOpenTab('/workspace/other.ts');
    });

    expect(monacoBridge.saveViewState).toHaveBeenCalledWith('/workspace/file.ts');
    expect(monacoBridge.getCurrentModelContent).toHaveBeenCalledTimes(1);
    expect(latestState?.contentMapRef.current.get('/workspace/file.ts')).toBe('const cached = 2;');
    expect(onOpenTab).toHaveBeenCalledWith('/workspace/other.ts');
  });
});
