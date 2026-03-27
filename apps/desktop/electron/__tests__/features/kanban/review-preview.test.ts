import { describe, expect, it, vi } from 'vitest';

import { cleanupCardReviewPreview, startCardReviewPreview } from '../../../features/kanban/review/workflow/review-preview';

describe('startCardReviewPreview', () => {
  it('starts a card-scoped preview server from the worktree', async () => {
    const tracker = {
      setPhase: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      addLogLine: vi.fn(),
    };
    const startDevServer = vi.fn().mockResolvedValue({
      serverId: 'workspace-1:card-preview:9:4173',
      url: 'http://127.0.0.1:4173',
    });

    const result = await startCardReviewPreview(
      'workspace-1',
      '/tmp/workspace',
      { id: '9', title: 'Preview card' },
      '/tmp/workspace/.sero/worktrees/card-9',
      tracker,
      {
        detectDevCommand: vi.fn().mockResolvedValue('pnpm run dev'),
        isContainerEnabled: vi.fn().mockResolvedValue(true),
        startDevServer,
        listServers: vi.fn().mockReturnValue([]),
        stopServer: vi.fn(),
        unregisterServer: vi.fn(),
      },
    );

    expect(startDevServer).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace/.sero/worktrees/card-9',
      command: 'pnpm run dev',
      name: 'Card #9 Preview',
      scope: 'card-preview',
      cardId: '9',
      logPath: '/tmp/sero-review-preview-card-9.log',
    });
    expect(tracker.setPhase).toHaveBeenCalledWith('Starting preview server');
    expect(result).toEqual({
      previewServerId: 'workspace-1:card-preview:9:4173',
      previewUrl: 'http://127.0.0.1:4173',
    });
  });
});

describe('cleanupCardReviewPreview', () => {
  it('stops and unregisters only preview servers for the target card', async () => {
    const stopServer = vi.fn().mockResolvedValue(true);
    const unregisterServer = vi.fn().mockReturnValue(true);

    const result = await cleanupCardReviewPreview(
      'workspace-1',
      '9',
      {
        listServers: vi.fn().mockReturnValue([
          {
            id: 'workspace-1:card-preview:9:4173',
            workspaceId: 'workspace-1',
            name: 'Card #9 Preview',
            port: 4173,
            url: 'http://127.0.0.1:4173',
            command: 'pnpm run dev',
            cwd: '/workspace/.sero/worktrees/card-9',
            scope: 'card-preview',
            cardId: '9',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
          {
            id: 'workspace-1:card-preview:10:4174',
            workspaceId: 'workspace-1',
            name: 'Card #10 Preview',
            port: 4174,
            url: 'http://127.0.0.1:4174',
            command: 'pnpm run dev',
            cwd: '/workspace/.sero/worktrees/card-10',
            scope: 'card-preview',
            cardId: '10',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
          {
            id: 'workspace-1:workspace:root:3000',
            workspaceId: 'workspace-1',
            name: 'Vite Dev Server',
            port: 3000,
            url: 'http://127.0.0.1:3000',
            command: 'pnpm run dev',
            cwd: '/workspace',
            scope: 'workspace',
            status: 'running',
            registeredAt: new Date().toISOString(),
          },
        ]),
        stopServer,
        unregisterServer,
      },
    );

    expect(stopServer).toHaveBeenCalledTimes(1);
    expect(stopServer).toHaveBeenCalledWith('workspace-1:card-preview:9:4173');
    expect(unregisterServer).toHaveBeenCalledWith('workspace-1:card-preview:9:4173');
    expect(result.removedServerIds).toEqual(['workspace-1:card-preview:9:4173']);
  });
});
