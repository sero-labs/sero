import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager } from '@electron/features/workspace/manager';
import {
  normalizeWorkspaceConfigForWrite,
  resolveWorkspaceRuntimeBackendDetails,
  resolveWorkspaceRuntimeConfig,
} from '@electron/features/workspace/runtime/config';
import { HOST_RELEASE_TARGETS } from '@electron/features/workspace/runtime/host-support-matrix';
import { getDefaultRuntimeBackend } from '@electron/features/workspace/runtime/platform-default';
import type { WorkspaceConfig } from '@/types/ipc';
import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

const tempDirs: string[] = [];

async function createTempWorkspace(config?: WorkspaceConfig): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-runtime-'));
  tempDirs.push(dir);
  if (config) {
    await writeFile(path.join(dir, '.sero-workspace.json'), JSON.stringify(config, null, 2), 'utf8');
  }
  return dir;
}

async function createTestManager(): Promise<WorkspaceManager> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-manager-'));
  tempDirs.push(dir);
  const agentDir = path.join(dir, 'agent');
  const workspacesDir = path.join(dir, 'workspaces');
  await mkdir(agentDir, { recursive: true });
  await mkdir(workspacesDir, { recursive: true });
  return new WorkspaceManager({
    agentDir,
    workspacesDir,
    registryPath: path.join(agentDir, 'workspaces.json'),
    editorStateDir: path.join(agentDir, 'editor-state'),
  });
}

function expectedContainerDefault(platform: NodeJS.Platform, arch: string): WorkspaceRuntimeBackend {
  return platform === 'darwin' && arch === 'arm64' ? 'apple-container' : 'docker';
}

describe('workspace runtime config migration', () => {
  afterEach(async () => {
    delete process.env.SERO_HOST_FIRST;
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('defines the host release support matrix and unsupported future policies', () => {
    expect(HOST_RELEASE_TARGETS).toEqual([
      {
        platform: 'darwin',
        arch: 'arm64',
        releaseSupported: true,
        hostDefault: true,
        browserPackRequired: true,
        packagedAppRequired: true,
      },
      {
        platform: 'darwin',
        arch: 'x64',
        releaseSupported: false,
        hostDefault: false,
        browserPackRequired: false,
        packagedAppRequired: false,
        notes: 'Unsupported: macOS on Intel CPUs is not a Sero target.',
      },
      {
        platform: 'linux',
        arch: 'x64',
        releaseSupported: true,
        hostDefault: true,
        browserPackRequired: true,
        packagedAppRequired: true,
      },
      {
        platform: 'linux',
        arch: 'arm64',
        releaseSupported: true,
        hostDefault: true,
        browserPackRequired: true,
        packagedAppRequired: true,
      },
      {
        platform: 'win32',
        arch: 'x64',
        releaseSupported: true,
        hostDefault: true,
        browserPackRequired: true,
        packagedAppRequired: true,
      },
      {
        platform: 'win32',
        arch: 'arm64',
        releaseSupported: false,
        hostDefault: false,
        browserPackRequired: false,
        packagedAppRequired: false,
        notes: 'Future: needs Windows ARM runner/package/browser-pack smoke.',
      },
    ]);
  });

  it('resolves legacy and new config shapes', () => {
    const platform = { platform: 'darwin' as const, arch: 'arm64' };

    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: true }, platform).backend)
      .toBe('apple-container');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: false }, platform).backend)
      .toBe('host');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: false }, { platform: 'linux', arch: 'x64' }).backend)
      .toBe('host');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: false }, { platform: 'win32', arch: 'x64' }).backend)
      .toBe('host');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App' }, platform).backend)
      .toBe('host');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', runtime: { backend: 'docker' } }, platform).backend)
      .toBe('docker');
  });

  it('defaults to host for every host-supported platform without SERO_HOST_FIRST', () => {
    delete process.env.SERO_HOST_FIRST;

    for (const target of HOST_RELEASE_TARGETS) {
      expect(getDefaultRuntimeBackend({ platform: target.platform, arch: target.arch })).toBe(
        target.hostDefault ? 'host' : expectedContainerDefault(target.platform, target.arch),
      );
    }
  });

  it('ignores deprecated SERO_HOST_FIRST for runtime defaults', () => {
    process.env.SERO_HOST_FIRST = '0';
    expect(getDefaultRuntimeBackend({ platform: 'win32', arch: 'x64' })).toBe('host');
    expect(getDefaultRuntimeBackend({ platform: 'darwin', arch: 'x64' })).toBe('docker');

    process.env.SERO_HOST_FIRST = '1';
    expect(getDefaultRuntimeBackend({ platform: 'linux', arch: 'arm64' })).toBe('host');
    expect(getDefaultRuntimeBackend({ platform: 'win32', arch: 'arm64' })).toBe('docker');
  });

  it('normalizes writes to runtime.backend and removes legacy container', () => {
    const normalized = normalizeWorkspaceConfigForWrite(
      { id: 'app', name: 'App', container: true },
      { platform: 'darwin', arch: 'arm64' },
    );

    expect(normalized.runtime).toEqual({ backend: 'apple-container' });
    expect(normalized.container).toBeUndefined();
  });

  it('loads deprecated mac-host alias as host and rewrites canonical host', () => {
    // Deprecated compatibility input; normalize to host on write.
    const legacy = { id: 'app', name: 'App', runtime: { backend: 'mac-host' } } as unknown as WorkspaceConfig;

    expect(resolveWorkspaceRuntimeConfig('app', legacy).backend).toBe('host');
    expect(normalizeWorkspaceConfigForWrite(legacy).runtime).toEqual({ backend: 'host' });
  });

  it('recovers managed workspace folders that are missing from the registry', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-recovery-'));
    tempDirs.push(dir);
    const agentDir = path.join(dir, 'agent');
    const workspacesDir = path.join(dir, 'workspaces');
    const workspacePath = path.join(workspacesDir, 'applecontainertest');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(path.join(workspacePath, '.sero-workspace.json'), JSON.stringify({
      id: 'applecontainertest',
      name: 'AppleContainerTest',
      runtime: { backend: 'docker' },
    }, null, 2), 'utf8');
    const manager = new WorkspaceManager({
      agentDir,
      workspacesDir,
      registryPath: path.join(agentDir, 'workspaces.json'),
      editorStateDir: path.join(agentDir, 'editor-state'),
    });

    await manager.init();

    const workspaces = await manager.list();
    expect(workspaces.map((workspace) => workspace.id)).toEqual(['global', 'applecontainertest']);
  });

  it('ignores recovered managed workspace folders with unsafe config ids', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-recovery-unsafe-'));
    tempDirs.push(dir);
    const agentDir = path.join(dir, 'agent');
    const workspacesDir = path.join(dir, 'workspaces');
    const workspacePath = path.join(workspacesDir, 'bad');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(path.join(workspacePath, '.sero-workspace.json'), JSON.stringify({
      id: 'bad:id',
      name: 'Bad',
      runtime: { backend: 'docker' },
    }, null, 2), 'utf8');
    const manager = new WorkspaceManager({
      agentDir,
      workspacesDir,
      registryPath: path.join(agentDir, 'workspaces.json'),
      editorStateDir: path.join(agentDir, 'editor-state'),
    });

    await manager.init();

    expect((await manager.list()).map((workspace) => workspace.id)).toEqual(['global']);
  });

  it('rewrites unsafe existing config ids when adding a folder', async () => {
    const workspacePath = await createTempWorkspace({ id: 'bad:id', name: 'Bad', runtime: { backend: 'docker' } } as WorkspaceConfig);
    const manager = await createTestManager();

    const info = await manager.addFolder(workspacePath, 'Safe Name');
    const written = JSON.parse(await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8')) as WorkspaceConfig;

    expect(info.id).not.toContain(':');
    expect(info.id).toMatch(/^sero-workspace-runtime-/);
    expect(written.id).toBe(info.id);
  });

  it('writes new workspace configs with runtime.backend', async () => {
    const workspacePath = await createTempWorkspace();
    const manager = await createTestManager();

    const info = await manager.addFolder(workspacePath, 'Runtime App');
    const raw = await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    const written = JSON.parse(raw) as WorkspaceConfig;

    expect(written.runtime?.backend).toBeDefined();
    expect(written.container).toBeUndefined();
    expect(info.runtime.backend).toBe(written.runtime?.backend);
    expect(info.container).toBe(info.runtime.backend !== 'host');
  });

  it('persists setRuntimeBackend and keeps container shims derived', async () => {
    const workspacePath = await createTempWorkspace({ id: 'app', name: 'App', container: true });
    const manager = await createTestManager();
    const info = await manager.addFolder(workspacePath);

    await manager.setRuntimeBackend(info.id, 'host');

    expect(await manager.getRuntimeConfig(info.id)).toEqual({ backend: 'host' });
    expect(await manager.isContainerEnabled(info.id)).toBe(false);

    const raw = await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    const written = JSON.parse(raw) as WorkspaceConfig;
    expect(written.runtime).toEqual({ backend: 'host' });
    expect(written.container).toBeUndefined();
  });

  it('treats deprecated mac-host configs as non-container and rewrites on save', async () => {
    // Deprecated compatibility input; normalize to host on write.
    const legacy = { id: 'app', name: 'App', runtime: { backend: 'mac-host' } } as unknown as WorkspaceConfig;
    const workspacePath = await createTempWorkspace(legacy);
    const manager = await createTestManager();
    const info = await manager.addFolder(workspacePath);

    expect(await manager.getRuntimeConfig(info.id)).toEqual({ backend: 'host' });
    expect(await manager.isContainerEnabled(info.id)).toBe(false);

    await manager.setRuntimeBackend(info.id, 'host');
    const raw = await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    const written = JSON.parse(raw) as WorkspaceConfig;
    expect(written.runtime).toEqual({ backend: 'host' });
  });

  it('allows the deprecated container shim to select host runtime on Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
    const workspacePath = await createTempWorkspace({ id: 'app', name: 'App', runtime: { backend: 'docker' } });
    const manager = await createTestManager();
    const info = await manager.addFolder(workspacePath);

    const result = await manager.setContainerEnabled(info.id, false);

    expect(result).toEqual({ ok: true, backend: 'host' });
    expect(await manager.getRuntimeConfig(info.id)).toEqual({ backend: 'host' });
    const raw = await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    expect((JSON.parse(raw) as WorkspaceConfig).runtime).toEqual({ backend: 'host' });
  });

  it('keeps deprecated container shim enablement selecting a container backend under host defaults', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.spyOn(process, 'arch', 'get').mockReturnValue('arm64');
    const workspacePath = await createTempWorkspace({ id: 'app', name: 'App', runtime: { backend: 'host' } });
    const manager = await createTestManager();
    const info = await manager.addFolder(workspacePath);

    const result = await manager.setContainerEnabled(info.id, true);

    expect(result).toEqual({ ok: true, backend: 'apple-container' });
    expect(await manager.getRuntimeConfig(info.id)).toEqual({ backend: 'apple-container' });
  });

  it('preserves an on-disk host runtime config when read on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const config = { id: 'app', name: 'App', runtime: { backend: 'host' as const } };
    expect(resolveWorkspaceRuntimeConfig('app', config).backend).toBe('host');
    expect(warn).not.toHaveBeenCalled();
  });

  it('migrates apple-container to the platform default outside macOS Apple Silicon', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = { id: 'app', name: 'App', runtime: { backend: 'apple-container' as const } };

    const linuxDetails = resolveWorkspaceRuntimeBackendDetails('app', config, { platform: 'linux', arch: 'x64' });
    expect(linuxDetails).toMatchObject({
      backend: 'docker',
      configuredBackend: 'apple-container',
      fallbackCode: 'backend-unsupported-on-platform',
    });
    expect(linuxDetails.fallbackReason).toContain('apple-container is not supported on linux');

    const windowsDetails = resolveWorkspaceRuntimeBackendDetails('app', config, { platform: 'win32', arch: 'x64' });
    expect(windowsDetails).toMatchObject({
      backend: 'docker',
      configuredBackend: 'apple-container',
      fallbackCode: 'backend-unsupported-on-platform',
    });

    const macIntelDetails = resolveWorkspaceRuntimeBackendDetails('app', config, { platform: 'darwin', arch: 'x64' });
    expect(macIntelDetails).toMatchObject({
      backend: 'docker',
      configuredBackend: 'apple-container',
      fallbackCode: 'backend-unsupported-on-platform',
    });

    expect(resolveWorkspaceRuntimeConfig('app', config, { platform: 'linux', arch: 'x64' }).backend).toBe('docker');
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the configured backend when it is supported', () => {
    const details = resolveWorkspaceRuntimeBackendDetails(
      'app',
      { id: 'app', name: 'App', runtime: { backend: 'docker' } },
      { platform: 'linux', arch: 'x64' },
    );

    expect(details).toEqual({ backend: 'docker', configuredBackend: 'docker' });
  });

  it('keeps persisted runtime backends authoritative under host defaults', () => {
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', runtime: { backend: 'docker' } }, { platform: 'linux', arch: 'x64' }).backend)
      .toBe('docker');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', runtime: { backend: 'apple-container' } }, { platform: 'darwin', arch: 'arm64' }).backend)
      .toBe('apple-container');
  });

  it('does not fall back from an unsupported persisted container backend to host under host defaults', () => {
    const config = { id: 'app', name: 'App', runtime: { backend: 'apple-container' as const } };

    expect(resolveWorkspaceRuntimeBackendDetails('app', config, { platform: 'linux', arch: 'x64' })).toMatchObject({
      backend: 'docker',
      configuredBackend: 'apple-container',
      fallbackCode: 'backend-unsupported-on-platform',
    });
    expect(resolveWorkspaceRuntimeConfig('app', config, { platform: 'win32', arch: 'x64' }).backend).toBe('docker');
  });

  it('tags mac-host migration with legacy-mac-host fallback code', () => {
    const legacy = { id: 'app', name: 'App', runtime: { backend: 'mac-host' } } as unknown as WorkspaceConfig;
    const details = resolveWorkspaceRuntimeBackendDetails('app', legacy, { platform: 'darwin', arch: 'arm64' });
    expect(details).toMatchObject({
      backend: 'host',
      configuredBackend: 'host',
      fallbackCode: 'legacy-mac-host',
    });
  });
});
