import { describe, expect, it, vi } from 'vitest';

import { listWorkspaceAccessRoots } from '@electron/features/workspace/access-roots';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

function createManager(overrides: Record<string, unknown> = {}): WorkspaceManager {
  return {
    getPath: vi.fn((id: string) => ({
      'ws-1': '/host/ws',
      docs: '/host/docs',
    })[id]),
    getConfig: vi.fn(async (id: string) => ({
      'ws-1': { id: 'ws-1', name: 'Workspace 1' },
      docs: { id: 'docs', name: 'Docs' },
    })[id] ?? null),
    getMounts: vi.fn(async () => []),
    getRoots: vi.fn(async () => []),
    getRuntimeBackendDetails: vi.fn(async () => ({ backend: 'apple-container', configuredBackend: 'apple-container' })),
    ...overrides,
  } as unknown as WorkspaceManager;
}

const existing = async () => true;

describe('listWorkspaceAccessRoots', () => {
  it('returns the primary workspace root in container mode', async () => {
    const result = await listWorkspaceAccessRoots(createManager(), 'ws-1', { pathExists: existing });

    expect(result.runtime).toEqual({ backend: 'apple-container', mode: 'container' });
    expect(result.roots).toEqual([
      expect.objectContaining({
        id: 'workspace',
        name: 'Workspace 1',
        kind: 'primary',
        hostPath: '/host/ws',
        runtimePath: '/workspace',
      }),
    ]);
  });

  it('includes references, mounts, additional roots, and linked plugin roots', async () => {
    const manager = createManager({
      getConfig: vi.fn(async (id: string) => ({
        'ws-1': { id: 'ws-1', name: 'Workspace 1', references: ['docs'] },
        docs: { id: 'docs', name: 'Docs' },
      })[id] ?? null),
      getMounts: vi.fn(async () => ['/host/shared']),
      getRoots: vi.fn(async () => [
        { id: 'data', name: 'Data', path: '/host/data', kind: 'folder' },
        { id: 'factory', name: 'Factory', path: '/host/factory', kind: 'linked-plugin' },
      ]),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', { pathExists: existing });

    expect(result.roots.map((root) => root.kind)).toEqual([
      'primary',
      'workspace-reference',
      'folder-mount',
      'additional-root',
      'linked-plugin',
    ]);
    expect(result.roots.find((root) => root.kind === 'linked-plugin')).toEqual(expect.objectContaining({
      id: 'factory',
      runtimePath: '/host/factory',
      source: { rootId: 'factory' },
    }));
  });

  it('keeps host mode bounded to configured roots', async () => {
    const manager = createManager({
      getMounts: vi.fn(async () => ['/host/shared']),
      getRuntimeBackendDetails: vi.fn(async () => ({ backend: 'host', configuredBackend: 'host' })),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', { pathExists: existing });

    expect(result.runtime.mode).toBe('host');
    expect(result.roots.map((root) => root.hostPath)).toEqual(['/host/ws', '/host/shared']);
    expect(result.roots.map((root) => root.runtimePath)).toEqual(['/host/ws', '/host/shared']);
  });

  it('dedupes by normalized host path and reports skipped duplicates', async () => {
    const manager = createManager({
      getMounts: vi.fn(async () => ['/host/ws/.', '/host/shared']),
      getRoots: vi.fn(async () => [{ id: 'shared', name: 'Shared', path: '/host/shared', kind: 'folder' }]),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', { pathExists: existing });

    expect(result.roots.map((root) => root.hostPath)).toEqual(['/host/ws', '/host/shared']);
    expect(result.warnings).toEqual([
      expect.stringContaining('duplicate'),
      expect.stringContaining('duplicate'),
    ]);
  });

  it('skips missing roots with warnings', async () => {
    const manager = createManager({
      getMounts: vi.fn(async () => ['/host/missing']),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', {
      pathExists: async (hostPath) => hostPath !== '/host/missing',
    });

    expect(result.roots).toHaveLength(1);
    expect(result.warnings[0]).toContain('Skipped missing folder-mount');
  });

  it('reports stale workspace references', async () => {
    const manager = createManager({
      getConfig: vi.fn(async () => ({ id: 'ws-1', name: 'Workspace 1', references: ['gone'] })),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', { pathExists: existing });

    expect(result.roots).toHaveLength(1);
    expect(result.warnings[0]).toContain('stale workspace reference');
  });

  it('maps Windows roots to Docker-style runtime paths in container mode', async () => {
    const manager = createManager({
      getMounts: vi.fn(async () => ['D:\\projects\\shared']),
    });

    const result = await listWorkspaceAccessRoots(manager, 'ws-1', {
      backend: 'docker',
      mode: 'container',
      pathExists: existing,
    });

    expect(result.roots[1]).toEqual(expect.objectContaining({
      hostPath: 'D:\\projects\\shared',
      runtimePath: '/mnt/d/projects/shared',
    }));
  });
});
