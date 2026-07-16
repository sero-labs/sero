// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { WorkspaceInfo } from '@/types/ipc';
import { useActiveWorkspace, useWorkspaceStore } from './workspace';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useWorkspaceStore.getState();

function createWorkspace(id: string): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/workspaces/${id}`,
    open: true,
    runtime: { backend: 'host' },
    container: false,
    references: [],
    mounts: [],
    roots: [],
  };
}

function ActiveWorkspaceProbe({ onRender }: { onRender: () => void }) {
  const activeWorkspace = useActiveWorkspace();
  onRender();
  return <span>{activeWorkspace?.name}</span>;
}

describe('workspace selectors', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useWorkspaceStore.setState({
      ...initialState,
      workspaces: [createWorkspace('active'), createWorkspace('other')],
      activeWorkspaceId: 'active',
    }, true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useWorkspaceStore.setState(initialState, true);
  });

  it('does not re-render active-workspace consumers when another workspace changes', async () => {
    let renderCount = 0;
    await act(async () => {
      root.render(<ActiveWorkspaceProbe onRender={() => { renderCount += 1; }} />);
    });

    await act(async () => {
      useWorkspaceStore.setState((state) => ({
        workspaces: state.workspaces.map((entry) => (
          entry.id === 'other' ? { ...entry, open: false } : entry
        )),
      }));
    });

    expect(container.textContent).toBe('active');
    expect(renderCount).toBe(1);
  });
});
