import { describe, expect, it, vi } from 'vitest';
import path from 'path';

// The module under test pulls SERO_AGENT_DIR through `platform/env`, which
// would otherwise eagerly read the user's profile registry. Stub it with a
// fixed path so the test stays hermetic.
vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_FIXED_ROOT: '/tmp/sero-fixed',
  SERO_HOST_ARTIFACTS_ROOT: '/tmp/sero-host-artifacts',
  SERO_HOME: '/tmp/sero-home',
}));

import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { WorkspaceRoot } from '@/types/ipc';

interface FakeManagerOptions {
  references?: Array<{ id: string; path: string }>;
  mounts?: string[];
  roots?: WorkspaceRoot[];
}

function makeFakeManager(options: FakeManagerOptions = {}): WorkspaceManager {
  const refs = options.references ?? [];
  const refIds = refs.map((r) => r.id);
  const refPathById = new Map(refs.map((r) => [r.id, r.path]));

  return {
    getReferences: vi.fn(async () => refIds),
    getPath: vi.fn((id: string) => refPathById.get(id)),
    getMounts: vi.fn(async () => options.mounts ?? []),
    getRoots: vi.fn(async () => options.roots ?? []),
  } as unknown as WorkspaceManager;
}

describe('buildWorkspaceContainerConfig', () => {
  it('returns just the read-only mounts when nothing is attached', async () => {
    const mgr = makeFakeManager();
    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg).toEqual({
      workspaceId: 'ws-1',
      hostPath: '/host/ws',
      readOnlyMounts: [
        path.join('/tmp/sero-agent', 'skills'),
        path.join('/tmp/sero-agent', 'prompts'),
        path.join('/tmp/sero-host-artifacts', 'shared', 'pi-docs'),
      ],
      writableMounts: [],
      bindMounts: [
        { source: path.join('/tmp/sero-fixed', 'logs'), target: '/workspace/.sero/logs/dev', readonly: true },
        { source: path.join('/tmp/sero-home', 'logs'), target: '/workspace/.sero/logs/profile', readonly: true },
        { source: path.join('/tmp/sero-home', 'debug'), target: '/workspace/.sero/logs/debug', readonly: true },
        { source: path.join('/tmp/sero-home', 'apps'), target: '/workspace/.sero/logs/apps', readonly: true },
        { source: path.join('/tmp/sero-agent', 'sessions'), target: '/workspace/.sero/logs/sessions', readonly: true },
      ],
    });
  });

  it('merges references, user mounts and additional roots into writableMounts', async () => {
    const mgr = makeFakeManager({
      references: [{ id: 'global', path: '/host/global' }],
      mounts: ['/host/data'],
      roots: [
        { id: 'sero-source', name: 'sero-source', path: '/host/sero', kind: 'folder' },
        { id: 'plugin', name: 'plugin', path: '/host/plugin', kind: 'linked-plugin' },
      ],
    });

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg.writableMounts).toEqual([
      '/host/global',
      '/host/data',
      '/host/sero',
      '/host/plugin',
    ]);
  });

  it('deduplicates a path that appears as both a user mount and a root', async () => {
    // This is the core provenance scenario: the user explicitly added
    // /host/shared as a mount AND attached it as a root. The container
    // must only see one bind-mount, but BOTH config entries must be
    // preserved (the dedup happens at build time, not by mutating config).
    const mgr = makeFakeManager({
      mounts: ['/host/shared'],
      roots: [{ id: 'shared', name: 'shared', path: '/host/shared', kind: 'folder' }],
    });

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg.writableMounts).toEqual(['/host/shared']);
  });

  it('skips any candidate that resolves to the workspace host path', async () => {
    const mgr = makeFakeManager({
      mounts: ['/host/ws'],
      roots: [{ id: 'self', name: 'self', path: '/host/ws/.', kind: 'folder' }],
    });

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg.writableMounts).toEqual([]);
  });

  it('normalises relative-looking inputs before deduplication', async () => {
    const mgr = makeFakeManager({
      mounts: ['/host/data/'],
      roots: [{ id: 'data', name: 'data', path: '/host/data', kind: 'folder' }],
    });

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg.writableMounts).toHaveLength(1);
    expect(cfg.writableMounts?.[0]).toBe(path.resolve('/host/data'));
  });

  it('skips all reference / mount / root work when isolated=true', async () => {
    const mgr = makeFakeManager({
      references: [{ id: 'global', path: '/host/global' }],
      mounts: ['/host/data'],
      roots: [{ id: 'sero', name: 'sero', path: '/host/sero', kind: 'folder' }],
    });

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws', {
      isolated: true,
    });

    expect(cfg.writableMounts).toEqual([]);
    expect(cfg.bindMounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: '/workspace/.sero/logs/dev' }),
      expect.objectContaining({ target: '/workspace/.sero/logs/sessions' }),
    ]));
    expect(mgr.getReferences).not.toHaveBeenCalled();
    expect(mgr.getMounts).not.toHaveBeenCalled();
    expect(mgr.getRoots).not.toHaveBeenCalled();
  });

  it('drops references whose getPath returns undefined', async () => {
    const mgr = makeFakeManager({
      references: [{ id: 'global', path: '/host/global' }],
    });
    // Force getPath to return undefined for the registered reference.
    (mgr.getPath as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const cfg = await buildWorkspaceContainerConfig(mgr, 'ws-1', '/host/ws');

    expect(cfg.writableMounts).toEqual([]);
  });
});
