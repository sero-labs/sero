// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamingWriteHandoff } from './useStreamingWriteHandoff';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useStreamingWriteHandoff', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestContent: string | null = null;
  const contentMapRef = { current: new Map<string, string>() };
  const savedContentRef = { current: new Map<string, string>() };
  const setContent = vi.fn();
  const readFile = vi.fn();

  function Harness({
    liveContent,
    dirty = false,
    editorPath = '/workspace/a.ts',
  }: {
    liveContent: string | null;
    dirty?: boolean;
    editorPath?: string;
  }) {
    latestContent = useStreamingWriteHandoff({
      workspaceId: 'ws-1',
      editorPath,
      liveContent,
      dirty,
      contentMapRef,
      savedContentRef,
      setContent,
    });
    return null;
  }

  beforeEach(() => {
    latestContent = null;
    contentMapRef.current.clear();
    savedContentRef.current.clear();
    setContent.mockReset();
    readFile.mockReset();
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: { editor: { readFile } },
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

  it('holds the final frame until fresh disk content arrives', async () => {
    const diskRead = createDeferred<string>();
    readFile.mockReturnValue(diskRead.promise);

    await act(async () => {
      root?.render(<Harness liveContent="partial file" />);
    });
    expect(latestContent).toBe('partial file');

    await act(async () => {
      root?.render(<Harness liveContent={null} />);
    });
    expect(latestContent).toBe('partial file');
    expect(readFile).toHaveBeenCalledWith('ws-1', '/workspace/a.ts');

    await act(async () => {
      diskRead.resolve('finished file');
      await diskRead.promise;
    });

    expect(contentMapRef.current.get('/workspace/a.ts')).toBe('finished file');
    expect(savedContentRef.current.get('/workspace/a.ts')).toBe('finished file');
    expect(setContent).toHaveBeenCalledWith('finished file');
    expect(latestContent).toBeNull();
  });

  it('does not take over or reload a dirty tab', async () => {
    await act(async () => {
      root?.render(<Harness liveContent="agent content" dirty />);
    });

    expect(latestContent).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('does not restore a held frame after the user changes tabs', async () => {
    readFile.mockReturnValue(new Promise<string>(() => {}));

    await act(async () => {
      root?.render(<Harness liveContent="partial file" />);
    });
    await act(async () => {
      root?.render(<Harness liveContent={null} />);
    });
    expect(latestContent).toBe('partial file');

    await act(async () => {
      root?.render(<Harness editorPath="/workspace/b.ts" liveContent={null} />);
    });
    await act(async () => {
      root?.render(<Harness liveContent={null} />);
    });

    expect(latestContent).toBeNull();
  });
});
