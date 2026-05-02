// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroEditorAPI, SeroFileTreeAPI, SeroVcsAPI } from '@/types/electron-workspace';
import { useFileTreeModel } from './useFileTreeModel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface CapturedTreeConfig {
  setExpandedItems: (updater: string[] | ((old: string[]) => string[])) => void;
}

const fakeTree = {
  rebuildTree: vi.fn(),
  getItems: vi.fn(() => []),
};

let latestTreeConfig: CapturedTreeConfig | null = null;

vi.mock('@headless-tree/core', () => ({
  createOnDropHandler: <T,>(handler: T) => handler,
  dragAndDropFeature: Symbol('dragAndDropFeature'),
  hotkeysCoreFeature: Symbol('hotkeysCoreFeature'),
  keyboardDragAndDropFeature: Symbol('keyboardDragAndDropFeature'),
  renamingFeature: Symbol('renamingFeature'),
  selectionFeature: Symbol('selectionFeature'),
  syncDataLoaderFeature: Symbol('syncDataLoaderFeature'),
}));

vi.mock('@headless-tree/react', () => ({
  useTree: vi.fn((config: CapturedTreeConfig) => {
    latestTreeConfig = {
      setExpandedItems: config.setExpandedItems,
    };
    return fakeTree;
  }),
}));

describe('useFileTreeModel', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let filetreeChangedHandler:
    | ((data: { workspaceId: string; directories: string[] }) => void)
    | null = null;
  let vcsEventHandler:
    | ((event: { type: string; workspaceId: string; checkpointId?: string }) => void)
    | null = null;

  const listFiles = vi.fn(
    async (_workspaceId: string, dirPath: string) => {
      if (dirPath === '/workspace') {
        return [
          { name: 'src', type: 'directory' as const, size: 0 },
          { name: 'README.md', type: 'file' as const, size: 10 },
        ];
      }
      if (dirPath === '/workspace/src') {
        return [{ name: 'index.ts', type: 'file' as const, size: 5 }];
      }
      return [];
    },
  );

  function Harness() {
    useFileTreeModel({
      workspaceId: 'ws-1',
      rootId: '/workspace',
      activePath: null,
      onFileSelect: vi.fn(),
    });
    return null;
  }

  beforeEach(() => {
    latestTreeConfig = null;
    fakeTree.rebuildTree.mockClear();
    fakeTree.getItems.mockClear();
    listFiles.mockClear();
    filetreeChangedHandler = null;
    vcsEventHandler = null;

    const editorApi: Pick<SeroEditorAPI, 'listFiles'> = {
      listFiles,
    };
    const filetreeApi: Pick<SeroFileTreeAPI, 'onChanged'> = {
      onChanged: vi.fn((callback) => {
        filetreeChangedHandler = callback;
        return () => {
          filetreeChangedHandler = null;
        };
      }),
    };
    const vcsApi: Pick<SeroVcsAPI, 'onEvent'> = {
      onEvent: vi.fn((callback) => {
        vcsEventHandler = callback;
        return () => {
          vcsEventHandler = null;
        };
      }),
    };

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        editor: editorApi,
        filetree: filetreeApi,
        vcs: vcsApi,
      },
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
    container.remove();
    Reflect.deleteProperty(window, 'sero');
  });

  it('loads the root directory, lazily loads expanded folders, and rebuilds the tree when data changes', async () => {
    await act(async () => {
      root?.render(<Harness />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace');
      expect(fakeTree.rebuildTree).toHaveBeenCalled();
    });
    expect(latestTreeConfig).not.toBeNull();

    await act(async () => {
      latestTreeConfig?.setExpandedItems(['/workspace', '/workspace/src']);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace/src');
    });
  });

  it('reloads only expanded directories on file-tree updates and all expanded directories on restore', async () => {
    await act(async () => {
      root?.render(<Harness />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace');
    });

    await act(async () => {
      latestTreeConfig?.setExpandedItems(['/workspace', '/workspace/src']);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace/src');
    });

    listFiles.mockClear();

    await act(async () => {
      filetreeChangedHandler?.({
        workspaceId: 'ws-1',
        directories: ['/workspace/src', '/workspace/ignored'],
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace/src');
    });

    listFiles.mockClear();

    await act(async () => {
      vcsEventHandler?.({
        type: 'restored',
        workspaceId: 'ws-1',
        checkpointId: 'cp-1',
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace');
      expect(listFiles).toHaveBeenCalledWith('ws-1', '/workspace/src');
    });
    expect(listFiles).toHaveBeenCalledTimes(2);
  });
});
