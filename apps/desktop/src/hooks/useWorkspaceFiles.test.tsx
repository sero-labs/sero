// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  resetWorkspaceFilesCacheForTests,
  useWorkspaceFiles,
} from './useWorkspaceFiles';
import { resetWorkspaceFiletreeWatchRefsForTests } from './workspace-filetree-subscription';
import type { EditorRoot } from '@/types/ipc';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type FileEntry = { name: string; type: 'file' | 'directory'; size: number };

describe('useWorkspaceFiles', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let onChangedHandler:
    | ((data: { workspaceId: string; directories: string[] }) => void)
    | null = null;
  let latestFiles: string[] = [];
  let latestIsLoading = false;

  const getRoots = vi.fn<() => Promise<EditorRoot[]>>(async () => [
    { id: 'workspace', name: 'Workspace', virtualPath: '/workspace', kind: 'workspace' },
  ]);
  const listFiles = vi.fn<(workspaceId: string, dirPath: string) => Promise<FileEntry[]>>();
  const watch = vi.fn(async () => {});
  const unwatch = vi.fn(async () => {});
  const unsubscribe = vi.fn();
  const onChanged = vi.fn((callback: (data: { workspaceId: string; directories: string[] }) => void) => {
    onChangedHandler = callback;
    return unsubscribe;
  });

  function Harness({ workspaceId }: { workspaceId: string | null }) {
    const { files, isLoading } = useWorkspaceFiles(workspaceId);
    latestFiles = files;
    latestIsLoading = isLoading;
    return null;
  }

  async function emitChange(workspaceId: string): Promise<void> {
    await act(async () => {
      onChangedHandler?.({ workspaceId, directories: ['/workspace/src'] });
      await Promise.resolve();
    });
  }

  function mockPrimarySrcFiles(filesByLoad: string[][]): void {
    listFiles.mockImplementation(async (_workspaceId, dirPath) => {
      if (dirPath === '/workspace') {
        return [{ name: 'src', type: 'directory', size: 0 }];
      }
      if (dirPath === '/workspace/src') {
        return (filesByLoad.shift() ?? []).map((name) => ({ name, type: 'file', size: 0 }));
      }
      return [];
    });
  }

  beforeEach(() => {
    getRoots.mockClear();
    listFiles.mockReset();
    watch.mockReset();
    unwatch.mockReset();
    unsubscribe.mockReset();
    onChanged.mockClear();
    onChangedHandler = null;
    latestFiles = [];
    latestIsLoading = false;
    resetWorkspaceFilesCacheForTests();
    resetWorkspaceFiletreeWatchRefsForTests();

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        editor: {
          getRoots,
          listFiles,
        },
        filetree: {
          watch,
          unwatch,
          onChanged,
        },
      } as unknown as typeof window.sero,
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
    resetWorkspaceFilesCacheForTests();
    resetWorkspaceFiletreeWatchRefsForTests();
  });

  it('reloads the cached file list immediately after create, rename, and delete events', async () => {
    mockPrimarySrcFiles([['a.ts'], ['a.ts', 'b.ts'], ['a.ts', 'c.ts'], ['c.ts']]);

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/a.ts']);
    });
    expect(watch).toHaveBeenCalledWith('ws-1');

    await emitChange('ws-1');
    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/a.ts', 'src/b.ts']);
    });

    await emitChange('ws-1');
    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/a.ts', 'src/c.ts']);
    });

    await emitChange('ws-1');
    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/c.ts']);
    });

    expect(getRoots).toHaveBeenCalledTimes(4);
    expect(latestIsLoading).toBe(false);
  });

  it('ignores filetree events for other workspaces', async () => {
    mockPrimarySrcFiles([['a.ts']]);

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/a.ts']);
    });

    await emitChange('ws-2');

    expect(getRoots).toHaveBeenCalledTimes(1);
  });

  it('loads all roots and excludes dependency/cache noise', async () => {
    getRoots.mockResolvedValueOnce([
      { id: 'workspace', name: 'Workspace', virtualPath: '/workspace', kind: 'workspace' as const },
      { id: 'shared', name: 'Shared', virtualPath: '/shared', kind: 'folder' as const },
    ]);
    listFiles.mockImplementation(async (_workspaceId, dirPath) => {
      const tree: Record<string, FileEntry[]> = {
        '/workspace': [
          { name: 'src', type: 'directory', size: 0 },
          { name: '.pnpm-store', type: 'directory', size: 0 },
          { name: '.eslintcache', type: 'file', size: 0 },
        ],
        '/workspace/src': [{ name: 'app.ts', type: 'file', size: 0 }],
        '/shared': [
          { name: '.cache', type: 'directory', size: 0 },
          { name: 'lib', type: 'directory', size: 0 },
        ],
        '/shared/lib': [{ name: 'util.ts', type: 'file', size: 0 }],
      };
      return tree[dirPath] ?? [];
    });

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/app.ts', '/shared/lib/util.ts']);
    });
  });

  it('cleans up the filetree subscription and watch on unmount', async () => {
    mockPrimarySrcFiles([['a.ts']]);

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await vi.waitFor(() => {
      expect(latestFiles).toEqual(['src/a.ts']);
    });

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unwatch).toHaveBeenCalledWith('ws-1');
  });
});
