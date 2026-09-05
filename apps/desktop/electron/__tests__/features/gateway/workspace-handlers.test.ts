import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

// The file-tree bridge is replaced: these tests are about the handler's
// scope checks, not about the filesystem watcher behind them.
const watchFileTree = vi.fn(async (_ws: unknown, _workspaceId: string, _canReach?: () => boolean) => true);
const unwatchFileTree = vi.fn((_ws: unknown, _workspaceId: string) => {});
vi.mock('@electron/features/gateway/bridge/file-tree-bridge', () => ({
  watchFileTree: (ws: unknown, workspaceId: string, canReach?: () => boolean) =>
    watchFileTree(ws, workspaceId, canReach),
  unwatchFileTree: (ws: unknown, workspaceId: string) => unwatchFileTree(ws, workspaceId),
}));

import { routeWorkspaceRequest } from '@electron/features/gateway/server/workspace-handlers';
import { GitCommitRefused } from '@electron/ipc/gateway/git-ops';
import type { GatewayAccessScope } from '@electron/features/gateway/server/access-control';
import type { GatewayAgentOps, GatewayGitStatus } from '@electron/features/gateway/server/types';
import type { GatewayRequest } from '@electron/features/gateway/server/protocol';

interface SentResponse {
  type: string;
  requestType?: string;
  data?: unknown;
  message?: string;
}

function fakeSocket(): { ws: WebSocket; sent: SentResponse[] } {
  const sent: SentResponse[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as SentResponse),
  } as unknown as WebSocket;
  return { ws, sent };
}

/** A scope reaching `workspaceIds`, or every workspace when null. */
function scope(workspaceIds: string[] | null): GatewayAccessScope {
  return {
    authorizedWorkspaceIds: workspaceIds === null ? null : new Set(workspaceIds),
    authorizedSessions: new Map(),
    authorizedArtifacts: new Map(),
  };
}

const status: GatewayGitStatus = {
  branch: 'main',
  ahead: 2,
  behind: 0,
  detached: false,
  merging: false,
  files: [{ path: 'src/a.ts', status: 'modified', staged: false }],
};

function makeOps(overrides: Partial<GatewayAgentOps> = {}): GatewayAgentOps {
  return {
    gitStatus: async () => status,
    gitDiff: async () => null,
    gitCommit: async () => ({ hash: 'abc1234', branch: 'main', fileCount: 2 }),
    ...overrides,
  } as unknown as GatewayAgentOps;
}

describe('git_status', () => {
  it('returns the working tree for an authorized workspace', async () => {
    const { ws, sent } = fakeSocket();

    await routeWorkspaceRequest(
      ws,
      makeOps(),
      { type: 'git_status', workspaceId: 'ws-1' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]).toMatchObject({ type: 'ok', data: status });
  });

  it('refuses a workspace the token cannot reach', async () => {
    const { ws, sent } = fakeSocket();
    const gitStatus = vi.fn();

    await routeWorkspaceRequest(
      ws,
      makeOps({ gitStatus }),
      { type: 'git_status', workspaceId: 'ws-2' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]?.type).toBe('error');
    expect(gitStatus).not.toHaveBeenCalled();
  });

  it('answers with an error when git fails', async () => {
    const { ws, sent } = fakeSocket();

    await routeWorkspaceRequest(
      ws,
      makeOps({
        gitStatus: async () => {
          throw new Error('not a repository');
        },
      }),
      { type: 'git_status', workspaceId: 'ws-1' } as GatewayRequest,
      scope(null),
    );

    expect(sent[0]).toMatchObject({ type: 'error', message: 'not a repository' });
  });
});

describe('git_diff', () => {
  it('passes the staged flag through, defaulting to the working tree', async () => {
    const { ws } = fakeSocket();
    const gitDiff = vi.fn(async () => null);

    await routeWorkspaceRequest(
      ws,
      makeOps({ gitDiff }),
      { type: 'git_diff', workspaceId: 'ws-1', path: 'src/a.ts' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(gitDiff).toHaveBeenCalledWith('ws-1', 'src/a.ts', false);
  });

  it('reads the staged copy when asked', async () => {
    const { ws } = fakeSocket();
    const gitDiff = vi.fn(async () => null);

    await routeWorkspaceRequest(
      ws,
      makeOps({ gitDiff }),
      { type: 'git_diff', workspaceId: 'ws-1', path: 'src/a.ts', staged: true } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(gitDiff).toHaveBeenCalledWith('ws-1', 'src/a.ts', true);
  });

  it('refuses a workspace the token cannot reach', async () => {
    const { ws, sent } = fakeSocket();

    await routeWorkspaceRequest(
      ws,
      makeOps(),
      { type: 'git_diff', workspaceId: 'ws-2', path: 'src/a.ts' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]?.type).toBe('error');
  });
});

describe('git_commit', () => {
  it('commits for an owner token', async () => {
    const { ws, sent } = fakeSocket();
    const gitCommit = vi.fn(async () => ({ hash: 'abc1234', branch: 'main', fileCount: 2 }));

    await routeWorkspaceRequest(
      ws,
      makeOps({ gitCommit }),
      {
        type: 'git_commit',
        workspaceId: 'ws-1',
        message: 'fix: the thing',
        paths: ['a.ts', 'b.ts'],
      } as GatewayRequest,
      scope(null),
    );

    expect(gitCommit).toHaveBeenCalledWith('ws-1', 'fix: the thing', ['a.ts', 'b.ts']);
    expect(sent[0]).toMatchObject({ type: 'ok', data: { hash: 'abc1234' } });
  });

  it('refuses a scoped token even for a workspace it can read', async () => {
    const { ws, sent } = fakeSocket();
    const gitCommit = vi.fn();

    await routeWorkspaceRequest(
      ws,
      makeOps({ gitCommit }),
      {
        type: 'git_commit',
        workspaceId: 'ws-1',
        message: 'fix: the thing',
        paths: ['a.ts'],
      } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]?.type).toBe('error');
    expect(sent[0]?.message).toContain('forbidden');
    expect(gitCommit).not.toHaveBeenCalled();
  });

  it('names the reason when a refusal comes back from the host', async () => {
    const { ws, sent } = fakeSocket();

    await routeWorkspaceRequest(
      ws,
      makeOps({
        gitCommit: async () => {
          throw new GitCommitRefused('git_state_busy', 'Finish the merge on the desktop first.');
        },
      }),
      {
        type: 'git_commit',
        workspaceId: 'ws-1',
        message: 'fix',
        paths: ['a.ts'],
      } as GatewayRequest,
      scope(null),
    );

    expect(sent[0]?.message).toBe('git_state_busy: Finish the merge on the desktop first.');
  });
});

describe('routeWorkspaceRequest', () => {
  it('leaves other request types to the next handler', async () => {
    const { ws, sent } = fakeSocket();

    const handled = await routeWorkspaceRequest(
      ws,
      makeOps(),
      { type: 'list_workspaces' } as GatewayRequest,
      scope(null),
    );

    expect(handled).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe('file_tree_watch', () => {
  it('starts a watch for an authorized workspace', async () => {
    const { ws, sent } = fakeSocket();

    await routeWorkspaceRequest(
      ws,
      makeOps(),
      { type: 'file_tree_watch', workspaceId: 'ws-1' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]).toMatchObject({ type: 'ok', data: { workspaceId: 'ws-1' } });
  });

  it('refuses, and drops the watch, when the token changed while the roots were resolved', async () => {
    const { ws, sent } = fakeSocket();
    const accessScope = scope(['ws-1']);
    watchFileTree.mockImplementationOnce(async () => {
      accessScope.authorizedWorkspaceIds = new Set(['ws-2']);
      return true;
    });

    await routeWorkspaceRequest(
      ws,
      makeOps(),
      { type: 'file_tree_watch', workspaceId: 'ws-1' } as GatewayRequest,
      accessScope,
    );

    expect(sent[0]?.type).toBe('error');
    expect(unwatchFileTree).toHaveBeenCalledWith(ws, 'ws-1');
  });
});
