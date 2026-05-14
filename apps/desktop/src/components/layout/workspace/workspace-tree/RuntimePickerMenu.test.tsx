// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { getRuntimePickerOptions, RuntimePickerMenu, runtimeName } from './RuntimePickerMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();

function workspace(runtime: WorkspaceInfo['runtime']): WorkspaceInfo {
  return {
    id: 'workspace-1',
    name: 'Workspace 1',
    path: '/tmp/workspace-1',
    open: true,
    runtime,
    container: runtime.backend !== 'host',
    references: [],
    mounts: [],
    roots: [],
  };
}

function installSero(platform: string) {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    writable: true,
    value: {
      platform,
      doctor: { runQuick: vi.fn(async () => ({ categories: [] })) },
    },
  });
}

function getTrigger() {
  const trigger = document.querySelector('[title^="Runtime:"]');
  if (!(trigger instanceof HTMLElement)) throw new Error('Expected runtime picker trigger');
  return trigger;
}

async function openPicker() {
  const trigger = getTrigger();
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('RuntimePickerMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const setRuntimeBackend = vi.fn(async () => {});

  beforeEach(() => {
    setRuntimeBackend.mockClear();
    useWorkspaceStore.setState({ ...initialWorkspaceState, setRuntimeBackend }, true);
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
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  it('renders canonical and deprecated host names as Host', () => {
    expect(runtimeName('host')).toBe('Host');
    expect(runtimeName('mac-host')).toBe('Host');
  });

  it('returns platform-specific runtime option sets', () => {
    expect(getRuntimePickerOptions('darwin').map((option) => option.backend)).toEqual([
      'apple-container',
      'docker',
      'host',
    ]);
    expect(getRuntimePickerOptions('linux').map((option) => option.backend)).toEqual(['docker', 'host']);
    expect(getRuntimePickerOptions('win32').map((option) => option.backend)).toEqual(['docker']);
  });

  it('shows macOS runtime choices with Host marked advanced', async () => {
    installSero('darwin');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    expect(document.body.textContent).toContain('Apple Container');
    expect(document.body.textContent).toContain('Recommended on Apple Silicon Macs');
    expect(document.body.textContent).toContain('Docker');
    expect(document.body.textContent).toContain('Portable Linux workspace for macOS Intel, Windows, and Linux');
    expect(document.body.textContent).toContain('Host');
    expect(document.body.textContent).toContain('Advanced');
    expect(document.body.textContent).toContain('least isolated');
    expect(document.body.textContent).toContain('preview port pool requires recreating the runtime/container');
  });

  it('shows only Docker on Windows', async () => {
    installSero('win32');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'docker' })} />);
    });
    await openPicker();

    expect(document.body.textContent).toContain('Docker');
    expect(document.body.textContent).toContain('Portable Linux workspace for macOS Intel, Windows, and Linux');
    expect(document.body.textContent).not.toContain('Apple Container');
    expect(document.body.textContent).not.toContain('WSL');
    expect(document.body.textContent).not.toContain('Host');
  });

  it('opens from a clickable row without bubbling trigger activation', async () => {
    installSero('darwin');
    const onRowClick = vi.fn();
    const onRowKeyDown = vi.fn();

    await act(async () => {
      root?.render(
        <div role="button" tabIndex={0} onClick={onRowClick} onKeyDown={onRowKeyDown}>
          <RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />
        </div>,
      );
    });

    const trigger = getTrigger();
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRowClick).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Apple Container');
    expect(document.body.textContent).toContain('Docker');

    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  it('writes runtime.backend through the workspace store', async () => {
    installSero('darwin');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    const docker = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Portable Linux workspace'),
    );
    if (!(docker instanceof HTMLButtonElement)) throw new Error('Expected Docker option');

    await act(async () => {
      docker.click();
      await Promise.resolve();
    });

    expect(setRuntimeBackend).toHaveBeenCalledWith('workspace-1', 'docker');
  });
});
