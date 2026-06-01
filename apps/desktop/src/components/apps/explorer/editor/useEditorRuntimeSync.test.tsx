// @vitest-environment jsdom

import { act, useState, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroEditorAPI, SeroFileTreeAPI, SeroVcsAPI } from '@/types/electron-workspace';
import { useEditorRuntimeSync } from './useEditorRuntimeSync';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  initialDirtyPaths?: Set<string>;
  initialContent?: string;
  contentMapRef: RefObject<Map<string, string>>;
  savedContentRef: RefObject<Map<string, string>>;
}

describe('useEditorRuntimeSync', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestContent = '';
  let latestDirtyPaths = new Set<string>();
  let filetreeChangedHandler:
    | Parameters<SeroFileTreeAPI['onChanged']>[0]
    | null = null;
  let vcsEventHandler: Parameters<SeroVcsAPI['onEvent']>[0] | null = null;

  const readFile = vi.fn<SeroEditorAPI['readFile']>(async () => 'fresh from disk');

  function Harness({
    workspaceId,
    tabs,
    activeTab,
    initialDirtyPaths = new Set<string>(),
    initialContent = '',
    contentMapRef,
    savedContentRef,
  }: HarnessProps) {
    const [content, setContent] = useState(initialContent);
    const [dirtyPaths, setDirtyPaths] = useState(initialDirtyPaths);
    latestContent = content;
    latestDirtyPaths = dirtyPaths;

    useEditorRuntimeSync({
      workspaceId,
      tabs,
      activeTab,
      dirtyPaths,
      contentMapRef,
      savedContentRef,
      setContent,
      setDirtyPaths,
    });

    return null;
  }

  beforeEach(() => {
    latestContent = '';
    latestDirtyPaths = new Set();
    filetreeChangedHandler = null;
    vcsEventHandler = null;
    readFile.mockReset();
    readFile.mockResolvedValue('fresh from disk');

    const editorApi: Pick<SeroEditorAPI, 'readFile'> = {
      readFile,
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
    container.remove();
    Reflect.deleteProperty(window, 'sero');
  });

  it('reloads non-dirty active tabs when their parent directory changes', async () => {
    const contentMapRef = {
      current: new Map([['/workspace/src/file.ts', 'stale']]),
    };
    const savedContentRef = {
      current: new Map([['/workspace/src/file.ts', 'stale']]),
    };

    await act(async () => {
      root?.render(
        <Harness
          workspaceId="ws-1"
          tabs={['/workspace/src/file.ts']}
          activeTab="/workspace/src/file.ts"
          initialContent="stale"
          contentMapRef={contentMapRef}
          savedContentRef={savedContentRef}
        />,
      );
    });

    await act(async () => {
      filetreeChangedHandler?.({
        workspaceId: 'ws-1',
        directories: ['/workspace/src'],
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(readFile).toHaveBeenCalledWith('ws-1', '/workspace/src/file.ts');
      expect(latestContent).toBe('fresh from disk');
    });
    expect(contentMapRef.current.get('/workspace/src/file.ts')).toBe('fresh from disk');
    expect(savedContentRef.current.get('/workspace/src/file.ts')).toBe('fresh from disk');
  });

  it('skips filesystem reloads for dirty tabs', async () => {
    const contentMapRef = {
      current: new Map([['/workspace/src/file.ts', 'edited']]),
    };
    const savedContentRef = {
      current: new Map([['/workspace/src/file.ts', 'stale']]),
    };

    await act(async () => {
      root?.render(
        <Harness
          workspaceId="ws-1"
          tabs={['/workspace/src/file.ts']}
          activeTab="/workspace/src/file.ts"
          initialDirtyPaths={new Set(['/workspace/src/file.ts'])}
          initialContent="edited"
          contentMapRef={contentMapRef}
          savedContentRef={savedContentRef}
        />,
      );
    });

    await act(async () => {
      filetreeChangedHandler?.({
        workspaceId: 'ws-1',
        directories: ['/workspace/src'],
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(filetreeChangedHandler).not.toBeNull();
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(latestContent).toBe('edited');
  });

  it('clears dirty state and reloads the active tab after a restore event', async () => {
    const contentMapRef = {
      current: new Map([['/workspace/src/file.ts', 'edited']]),
    };
    const savedContentRef = {
      current: new Map([['/workspace/src/file.ts', 'stale']]),
    };

    await act(async () => {
      root?.render(
        <Harness
          workspaceId="ws-1"
          tabs={['/workspace/src/file.ts']}
          activeTab="/workspace/src/file.ts"
          initialDirtyPaths={new Set(['/workspace/src/file.ts'])}
          initialContent="edited"
          contentMapRef={contentMapRef}
          savedContentRef={savedContentRef}
        />,
      );
    });

    readFile.mockResolvedValue('restored from vcs');

    await act(async () => {
      vcsEventHandler?.({
        type: 'restored',
        workspaceId: 'ws-1',
        checkpointId: 'cp-1',
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(readFile).toHaveBeenCalledWith('ws-1', '/workspace/src/file.ts');
      expect(latestContent).toBe('restored from vcs');
    });
    expect(latestDirtyPaths.size).toBe(0);
    expect(contentMapRef.current.get('/workspace/src/file.ts')).toBe('restored from vcs');
    expect(savedContentRef.current.get('/workspace/src/file.ts')).toBe('restored from vcs');
  });
});
