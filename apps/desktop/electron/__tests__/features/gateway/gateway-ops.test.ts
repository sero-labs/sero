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
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  containerManager: mocks.containerManager,
  artifactRegistry: mocks.artifactRegistry,
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
});
