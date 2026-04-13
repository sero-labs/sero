// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorRoot } from '@/types/ipc';
import {
  resetWorkspaceFiletreeWatchRefsForTests,
  retainWorkspaceFiletreeWatch,
} from '@/hooks/workspace-filetree-subscription';
import { useWorkspaceFileWatch } from './useWorkspaceFileWatch';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('useWorkspaceFileWatch', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const watch = vi.fn(async () => {});
  const unwatch = vi.fn(async () => {});
  const roots: EditorRoot[] = [
    {
      id: 'workspace',
      name: 'Workspace',
      virtualPath: '/workspace',
      kind: 'workspace',
    },
  ];

  function Harness({ workspaceId }: { workspaceId: string }) {
    useWorkspaceFileWatch(workspaceId, roots);
    return null;
  }

  beforeEach(() => {
    watch.mockReset();
    unwatch.mockReset();
    resetWorkspaceFiletreeWatchRefsForTests();

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        filetree: {
          watch,
          unwatch,
          onChanged: vi.fn(() => () => {}),
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
    resetWorkspaceFiletreeWatchRefsForTests();
  });

  it('refreshes the shared watcher on first mount when another consumer already retained it', async () => {
    const releaseSharedWatch = retainWorkspaceFiletreeWatch('ws-1');
    expect(watch).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    expect(watch).toHaveBeenCalledTimes(2);
    releaseSharedWatch();
  });

  it('does not double-refresh the watcher on the first mount when it owns the watch', async () => {
    await act(async () => {
      root?.render(<Harness workspaceId="ws-1" />);
    });

    expect(watch).toHaveBeenCalledTimes(1);
  });
});
