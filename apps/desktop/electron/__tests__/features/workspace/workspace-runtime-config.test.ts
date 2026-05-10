import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from '@electron/features/workspace/manager';
import {
  normalizeWorkspaceConfigForWrite,
  resolveWorkspaceRuntimeConfig,
} from '@electron/features/workspace/runtime/config';
import { getDefaultRuntimeBackend } from '@electron/features/workspace/runtime/platform-default';
import type { WorkspaceConfig } from '@/types/ipc';

const tempDirs: string[] = [];

async function createTempWorkspace(config?: WorkspaceConfig): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-runtime-'));
  tempDirs.push(dir);
  if (config) {
    await writeFile(path.join(dir, '.sero-workspace.json'), JSON.stringify(config, null, 2), 'utf8');
  }
  return dir;
}

describe('workspace runtime config migration', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('resolves legacy and new config shapes', () => {
    const platform = { platform: 'darwin' as const, arch: 'arm64' };

    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: true }, platform).backend)
      .toBe('apple-container');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', container: false }, platform).backend)
      .toBe('host');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App' }, platform).backend)
      .toBe('apple-container');
    expect(resolveWorkspaceRuntimeConfig('app', { id: 'app', name: 'App', runtime: { backend: 'docker' } }, platform).backend)
      .toBe('docker');
  });

  it('uses platform defaults for macOS Apple Silicon, macOS Intel, Windows, Linux, and global', () => {
    expect(getDefaultRuntimeBackend({ platform: 'darwin', arch: 'arm64' })).toBe('apple-container');
    expect(getDefaultRuntimeBackend({ platform: 'darwin', arch: 'x64' })).toBe('docker');
    expect(getDefaultRuntimeBackend({ platform: 'win32', arch: 'x64' })).toBe('docker');
    expect(getDefaultRuntimeBackend({ platform: 'linux', arch: 'arm64' })).toBe('docker');
    expect(getDefaultRuntimeBackend({ workspaceId: 'global', platform: 'linux', arch: 'x64' })).toBe('host');
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

  it('writes new workspace configs with runtime.backend', async () => {
    const workspacePath = await createTempWorkspace();
    const manager = new WorkspaceManager();

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
    const manager = new WorkspaceManager();
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
    const manager = new WorkspaceManager();
    const info = await manager.addFolder(workspacePath);

    expect(await manager.getRuntimeConfig(info.id)).toEqual({ backend: 'host' });
    expect(await manager.isContainerEnabled(info.id)).toBe(false);

    await manager.setRuntimeBackend(info.id, 'host');
    const raw = await readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    const written = JSON.parse(raw) as WorkspaceConfig;
    expect(written.runtime).toEqual({ backend: 'host' });
  });
});
