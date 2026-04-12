import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@mariozechner/pi-coding-agent', () => ({
  SessionManager: mocks.sessionManager,
}));

describe('buildGatewayOps.getSessionHistory', () => {
  it('rejects pooled sessions whose workspace does not match the requested workspace', async () => {
    const { buildGatewayOps } = await import('@electron/ipc/gateway/gateway-ops');

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
