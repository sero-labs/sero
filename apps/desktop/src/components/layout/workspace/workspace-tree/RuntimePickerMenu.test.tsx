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

function installSero(platform: string, arch = 'x64') {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    writable: true,
    value: {
      platform,
      arch,
      doctor: {
        run: vi.fn(async () => makeDoctorReport()),
        runQuick: vi.fn(async () => makeDoctorReport()),
        exportReport: vi.fn(async () => ({ saved: false })),
        copyReport: vi.fn(async () => undefined),
        invokeRepair: vi.fn(async () => ({ status: 'skipped', message: 'No repair' })),
        onEvent: vi.fn(() => () => undefined),
      },
    },
  });
}

function makeDoctorReport() {
  return {
    schemaVersion: 1 as const,
    timestamp: '2026-05-14T00:00:00.000Z',
    mode: 'quick' as const,
    system: { os: 'darwin', version: 'test', arch: 'arm64' },
    seroVersion: '0.0.0-test',
    runId: 'doctor-test-run',
    profilesScanned: [],
    results: [],
    envAudit: { present: [], missing: [], recommended: [] },
    durationMs: 1,
  };
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
    expect(getRuntimePickerOptions('darwin', 'arm64').map((option) => option.backend)).toEqual([
      'host',
      'apple-container',
      'docker',
    ]);
    expect(getRuntimePickerOptions('darwin', 'x64').map((option) => option.backend)).toEqual(['host', 'docker']);
    expect(getRuntimePickerOptions('linux', 'x64').map((option) => option.backend)).toEqual(['host', 'docker']);
    expect(getRuntimePickerOptions('win32', 'x64').map((option) => option.backend)).toEqual(['host', 'docker']);
  });

  it('marks the default runtime using the platform support matrix', () => {
    const macArm = getRuntimePickerOptions('darwin', 'arm64');
    expect(macArm.find((option) => option.backend === 'host')?.recommended).toBe(true);
    expect(macArm.find((option) => option.backend === 'docker')?.optional).toBe(true);

    const macIntel = getRuntimePickerOptions('darwin', 'x64');
    expect(macIntel.find((option) => option.backend === 'host')?.optional).toBe(true);
    expect(macIntel.find((option) => option.backend === 'host')?.recommended).toBe(false);
    expect(macIntel.find((option) => option.backend === 'docker')?.optional).toBe(true);
    expect(macIntel.find((option) => option.backend === 'docker')?.recommended).toBe(false);

    const windowsX64 = getRuntimePickerOptions('win32', 'x64');
    expect(windowsX64.find((option) => option.backend === 'host')?.recommended).toBe(true);
    expect(windowsX64.find((option) => option.backend === 'docker')?.optional).toBe(true);
  });

  it('shows macOS Apple Silicon runtime choices with Host default and containers optional', async () => {
    installSero('darwin', 'arm64');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    expect(document.body.textContent).toContain('Apple Container');
    expect(document.body.textContent).toContain('Explicit Apple-native container runtime');
    expect(document.body.textContent).toContain('Docker / Podman');
    expect(document.body.textContent).toContain('Explicit container runtime');
    expect(document.body.textContent).toContain('Host');
    expect(document.body.textContent).not.toContain('Host (recommended)');
    expect(document.body.textContent).toContain('Default');
    expect(document.body.textContent).not.toContain('Recommended');
    expect(document.body.textContent).toContain('Optional');
    expect(document.body.textContent).toContain('Default local runtime');
    expect(document.body.textContent).toContain('No container isolation');
    expect(document.body.textContent).toContain('Host is the normal default for local work');
  });

  it('hides Apple Container on macOS Intel without marking a default runtime', async () => {
    installSero('darwin', 'x64');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'docker' })} />);
    });
    await openPicker();

    expect(document.body.textContent).toContain('Docker / Podman');
    expect(document.body.textContent).toContain('Host');
    expect(document.body.textContent).toContain('HostOptional');
    expect(document.body.textContent).toContain('Docker / PodmanOptional');
    expect(document.body.textContent).toContain('Host is not the default on this platform');
    expect(document.body.textContent).not.toContain('Default');
    expect(document.body.textContent).not.toContain('Apple Container');
  });

  it('shows Host and Docker on Windows', async () => {
    installSero('win32', 'x64');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'docker' })} />);
    });
    await openPicker();

    expect(document.body.textContent).toContain('Host');
    expect(document.body.textContent).not.toContain('Host (recommended)');
    expect(document.body.textContent).toContain('Docker / Podman');
    expect(document.body.textContent).toContain('Explicit container runtime');
    expect(document.body.textContent).not.toContain('Apple Container');
    expect(document.body.textContent).not.toContain('WSL');
  });

  it('opens from a clickable row without bubbling trigger activation', async () => {
    installSero('darwin', 'arm64');
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
    installSero('darwin', 'arm64');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    const docker = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Explicit container runtime'),
    );
    if (!(docker instanceof HTMLButtonElement)) throw new Error('Expected Docker option');

    await act(async () => {
      docker.click();
      await Promise.resolve();
    });

    expect(setRuntimeBackend).toHaveBeenCalledWith('workspace-1', 'docker');
    expect(document.body.textContent).toContain('switching to Docker / Podman');
  });

  it('keeps the picker open with visible pending state while changing runtimes', async () => {
    installSero('darwin', 'arm64');
    let finishSwitch!: () => void;
    setRuntimeBackend.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishSwitch = resolve;
    }));

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    const docker = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Explicit container runtime'),
    );
    if (!(docker instanceof HTMLButtonElement)) throw new Error('Expected Docker option');

    await act(async () => {
      docker.click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Switching Workspace 1 to Docker / Podman…');
    expect(document.body.textContent).toContain('Workspace runtime');
    expect(docker.disabled).toBe(true);

    await act(async () => {
      finishSwitch();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Workspace 1 is switching to Docker / Podman');
  });

  it('opens the Environment Doctor dialog from the footer button', async () => {
    installSero('darwin', 'arm64');

    await act(async () => {
      root?.render(<RuntimePickerMenu workspace={workspace({ backend: 'apple-container' })} />);
    });
    await openPicker();

    const doctorButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open Environment Doctor'),
    );
    if (!(doctorButton instanceof HTMLButtonElement)) throw new Error('Expected Doctor button');

    await act(async () => {
      doctorButton.click();
    });

    expect(document.body.textContent).toContain('Run diagnostics for Sero, profiles, providers, plugins, and runtime setup.');
    expect(document.body.textContent).toContain('Press Re-run or Quick to gather diagnostics.');
  });
});
