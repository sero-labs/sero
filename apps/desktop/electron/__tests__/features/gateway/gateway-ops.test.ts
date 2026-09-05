import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGatewayOps } from '@electron/ipc/gateway/gateway-ops';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
  },
  containerManager: {
    exec: vi.fn(),
  },
  artifactRegistry: {
    list: vi.fn(),
    get: vi.fn(),
  },
  sessionManager: {
    list: vi.fn(),
    open: vi.fn(),
    create: vi.fn(),
  },
  runtime: {
    runtimeWorkspacePath: '/workspace',
    listFiles: vi.fn(),
  },
  runtimeManager: {
    getRuntime: vi.fn(),
  },
  unlink: vi.fn(),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, default: { ...actual, unlink: mocks.unlink }, unlink: mocks.unlink };
});

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  containerManager: mocks.containerManager,
  artifactRegistry: mocks.artifactRegistry,
  runtimeManager: mocks.runtimeManager,
  SERO_SESSION_DIR: '/tmp/sero-test-sessions',
}));

vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@earendil-works/pi-coding-agent')>();
  return {
    ...actual,
    SessionManager: mocks.sessionManager,
  };
});

describe('buildGatewayOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeManager.getRuntime.mockResolvedValue(mocks.runtime);
    mocks.runtime.listFiles.mockResolvedValue([]);
    mocks.unlink.mockResolvedValue(undefined);
  });

  it('lists the workspace root when the remote asks for "/"', async () => {
    mocks.runtime.listFiles.mockResolvedValue([
      { name: 'src', path: '/workspace/src', type: 'directory', size: 0 },
      { name: '.git', path: '/workspace/.git', type: 'directory', size: 0 },
    ]);

    const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());
    const entries = await ops.listFiles('workspace-a', '/');

    expect(mocks.runtime.listFiles).toHaveBeenCalledWith({ path: '/workspace' });
    expect(entries.map((entry) => entry.name)).toEqual(['src']);
  });

  it('passes a runtime path from an earlier listing through unchanged', async () => {
    const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());
    await ops.listFiles('workspace-a', '/workspace/src');

    expect(mocks.runtime.listFiles).toHaveBeenCalledWith({ path: '/workspace/src' });
  });

  it('reuses an existing on-disk session when opening by session ID', async () => {
    mocks.workspaceManager.getPath.mockReturnValue('/workspace-a');
    mocks.sessionManager.list.mockResolvedValue([
      { id: 'session-123', cwd: '/workspace-a', path: '/sessions/session-123.jsonl' },
    ]);

    const openSessionInternal = vi.fn().mockResolvedValue(undefined);
    const pool = {
      has: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
    };

    const ops = buildGatewayOps(pool, openSessionInternal);
    await ops.openSession('session-123', 'workspace-a');

    expect(mocks.sessionManager.create).not.toHaveBeenCalled();
    expect(openSessionInternal).toHaveBeenCalledWith(
      'session-123',
      '/sessions/session-123.jsonl',
      'workspace-a',
    );
  });

  it('rejects pooled sessions whose workspace does not match the requested workspace', async () => {
    const pool = {
      has: vi.fn(),
      get: vi.fn().mockReturnValue({
        workspaceId: 'workspace-b',
        session: { messages: [] },
      }),
    };

    const ops = buildGatewayOps(pool, vi.fn());

    await expect(
      ops.getSessionHistory('workspace-a', 'session-123'),
    ).rejects.toThrow(
      'Session session-123 is bound to workspace workspace-b, not workspace-a',
    );

    expect(mocks.workspaceManager.getPath).not.toHaveBeenCalled();
    expect(mocks.sessionManager.list).not.toHaveBeenCalled();
    expect(mocks.sessionManager.open).not.toHaveBeenCalled();
  });

  describe('deleteSession', () => {
    it('deletes the session file the workspace holds', async () => {
      mocks.workspaceManager.getPath.mockReturnValue('/workspace-a');
      mocks.sessionManager.list.mockResolvedValue([
        {
          id: 'session-123',
          cwd: '/workspace-a',
          path: '/tmp/sero-test-sessions/session-123.jsonl',
        },
      ]);

      const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());
      await ops.deleteSession('workspace-a', 'session-123');

      expect(mocks.unlink).toHaveBeenCalledWith('/tmp/sero-test-sessions/session-123.jsonl');
    });

    it('deletes nothing when the workspace does not hold the session', async () => {
      mocks.workspaceManager.getPath.mockReturnValue('/workspace-a');
      mocks.sessionManager.list.mockResolvedValue([]);

      const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());

      await expect(
        ops.deleteSession('workspace-a', 'session-elsewhere'),
      ).rejects.toThrow('Session not found in workspace: session-elsewhere');

      expect(mocks.unlink).not.toHaveBeenCalled();
    });

    it('refuses a session path outside the session directory', async () => {
      mocks.workspaceManager.getPath.mockReturnValue('/workspace-a');
      mocks.sessionManager.list.mockResolvedValue([
        { id: 'session-123', cwd: '/workspace-a', path: '/etc/passwd' },
      ]);

      const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());

      await expect(
        ops.deleteSession('workspace-a', 'session-123'),
      ).rejects.toThrow('Refusing to delete file outside session directory');

      expect(mocks.unlink).not.toHaveBeenCalled();
    });

    it('succeeds when the session file is already gone', async () => {
      mocks.workspaceManager.getPath.mockReturnValue('/workspace-a');
      mocks.sessionManager.list.mockResolvedValue([
        {
          id: 'session-123',
          cwd: '/workspace-a',
          path: '/tmp/sero-test-sessions/session-123.jsonl',
        },
      ]);
      const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
      mocks.unlink.mockRejectedValue(missing);

      const ops = buildGatewayOps({ has: vi.fn(), get: vi.fn() }, vi.fn());

      await expect(ops.deleteSession('workspace-a', 'session-123')).resolves.toBeUndefined();
    });
  });
});
