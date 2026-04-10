// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useWorkspaceRootsRefresh } from './useWorkspaceRootsRefresh';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('useWorkspaceRootsRefresh', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let onChangedHandler:
    | ((data: { workspaceId: string; directories: string[] }) => void)
    | null = null;

  const unsubscribe = vi.fn();
  const onChanged = vi.fn((callback: (data: { workspaceId: string; directories: string[] }) => void) => {
    onChangedHandler = callback;
    return unsubscribe;
  });
  const refreshRoots = vi.fn(async () => {});

  function Harness({ workspaceId }: { workspaceId: string }) {
    useWorkspaceRootsRefresh(workspaceId, refreshRoots);
    return null;
  }

  beforeEach(() => {
    unsubscribe.mockReset();
    onChanged.mockClear();
    refreshRoots.mockClear();
    onChangedHandler = null;

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        filetree: {
          watch: vi.fn(async () => {}),
          unwatch: vi.fn(async () => {}),
          onChanged,
        },
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
    container.remove();
    Reflect.deleteProperty(window, 'sero');
  });

  it('refreshes roots when the active workspace root directory changes', async () => {
    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    act(() => {
      onChangedHandler?.({ workspaceId: 'ws-1', directories: ['/workspace'] });
    });

    expect(refreshRoots).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated workspace and non-root directory changes', async () => {
    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    act(() => {
      onChangedHandler?.({ workspaceId: 'ws-2', directories: ['/workspace'] });
      onChangedHandler?.({ workspaceId: 'ws-1', directories: ['/workspace/src'] });
      onChangedHandler?.({ workspaceId: 'ws-1', directories: ['/linked-plugin'] });
    });

    expect(refreshRoots).not.toHaveBeenCalled();
  });

  it('cleans up the filetree subscription on unmount', async () => {
    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
