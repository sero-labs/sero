import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KanbanRuntimeHost } from '../types';
import type { Card, KanbanState, KanbanSettings } from '../core/types';
import { AutoMergeMonitor, buildAutoMergePendingMessage } from './auto-merge-monitor';

function makeSettings(overrides: Partial<KanbanSettings> = {}): KanbanSettings {
  return {
    autoAdvance: true,
    reviewMode: 'full',
    testingEnabled: true,
    yoloMode: true,
    yoloAutoMergePrs: true,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Auto-merge review card',
    description: 'Wait for GitHub auto-merge',
    acceptance: ['PR lands automatically'],
    priority: 'medium',
    column: 'review',
    status: 'waiting-input',
    subtasks: [],
    prUrl: 'https://github.com/monobyte/sero/pull/1',
    prNumber: 1,
    worktreePath: '/tmp/worktree',
    error: buildAutoMergePendingMessage(1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(card: Card, settings: KanbanSettings = makeSettings()): KanbanState {
  return {
    cards: [card],
    nextId: 2,
    settings,
  };
}

function createHost(initialState: KanbanState): {
  host: KanbanRuntimeHost;
  readMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  getPrMergeStateMock: ReturnType<typeof vi.fn>;
  getPrMergeErrorMock: ReturnType<typeof vi.fn>;
} {
  let currentState: KanbanState | null = initialState;
  const readMock = vi.fn(async (_stateFilePath: string) => currentState);
  const updateMock = vi.fn(async (
    _stateFilePath: string,
    updater: (state: KanbanState | null) => KanbanState,
  ) => {
    currentState = updater(currentState);
  });
  const getPrMergeStateMock = vi.fn(async () => 'open' as const);
  const getPrMergeErrorMock = vi.fn(async () => null);

  const host = {
    appState: {
      read: async <T = unknown>(stateFilePath: string) => readMock(stateFilePath) as Promise<T | null>,
      update: async <T = unknown>(
        stateFilePath: string,
        updater: (current: T | null) => T,
      ) => {
        await updateMock(stateFilePath, updater as (state: KanbanState | null) => KanbanState);
      },
      watch: () => {},
      unwatch: () => {},
    },
    subagents: {
      runStructured: async () => ({ response: '' }),
      onLiveOutput: () => () => {},
    },
    workspace: {
      runCommand: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      refreshAfterSync: async () => ({ refreshed: false, dependenciesInstalled: false, restartedServerIds: [] }),
      resolveRuntime: async () => ({
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/workspace',
        desiredRuntime: 'host' as const,
        actualRuntime: 'host' as const,
        containerEnabled: false,
        capabilityAudit: [],
      }),
    },
    verification: {
      detectCompileCommands: async () => [],
      detectDependencyInstallCommand: async () => null,
      detectDevServerCommand: async () => null,
      detectVerificationCommands: async () => [],
      runCommands: async () => ({ success: true, results: [] }),
      runDevServerSmokeCheck: async () => ({
        command: 'pnpm dev',
        success: true,
        stdout: '',
        stderr: '',
        durationMs: 0,
      }),
      summarizeFailure: () => 'failure',
    },
    git: {
      createWorktree: async () => ({ worktreePath: '', branchName: '', greenfield: false }),
      removeWorktree: async () => {},
      syncWorktreeWithDefaultBranch: async () => ({ success: true, updated: false, resolvedConflicts: false }),
      syncWorkspaceRootToDefaultBranch: async () => ({ synced: true }),
      createCheckpoint: async () => null,
      getDiffSummary: async () => '',
      getDiff: async () => '',
      pushBranch: async () => true,
      ensureRemoteDefaultBranch: async () => 'main',
      createPr: async () => ({ success: true as const, url: 'https://example.test/pr/1', number: 1 }),
      mergePr: async () => ({ success: true as const, state: 'merged' as const }),
      getPrMergeState: getPrMergeStateMock,
      getPrMergeError: getPrMergeErrorMock,
    },
    devServers: {
      startManaged: async () => ({ reason: 'not-used' }),
      list: () => [],
      stop: async () => false,
      restart: async () => false,
      unregister: () => false,
    },
  } satisfies KanbanRuntimeHost;

  return { host, readMock, updateMock, getPrMergeStateMock, getPrMergeErrorMock };
}

describe('AutoMergeMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('promotes pending review cards to done once GitHub reports them as merged', async () => {
    const state = makeState(makeCard());
    const { host, updateMock, getPrMergeStateMock } = createHost(state);
    getPrMergeStateMock.mockResolvedValue('merged');

    const monitor = new AutoMergeMonitor(host);
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, state);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(getPrMergeStateMock).toHaveBeenCalledWith('/tmp/worktree', 1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('/tmp/state.json', expect.any(Function));

    const saved = await host.appState.read<KanbanState>('/tmp/state.json');
    expect(saved?.cards[0]).toMatchObject({
      column: 'done',
      status: 'idle',
      error: undefined,
    });
    expect(saved?.cards[0]?.completedAt).toEqual(expect.any(String));
  });

  it('records the merge error when GitHub closes the PR without merging', async () => {
    const state = makeState(makeCard());
    const { host, getPrMergeStateMock, getPrMergeErrorMock } = createHost(state);
    getPrMergeStateMock.mockResolvedValue('closed');
    getPrMergeErrorMock.mockResolvedValue('PR #1 was closed without merging.');

    const monitor = new AutoMergeMonitor(host);
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, state);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(getPrMergeErrorMock).toHaveBeenCalledWith('/tmp/worktree', 1);

    const saved = await host.appState.read<KanbanState>('/tmp/state.json');
    expect(saved?.cards[0]).toMatchObject({
      column: 'review',
      status: 'waiting-input',
      error: 'PR #1 was closed without merging.',
    });
  });

  it('keeps polling pending cards while GitHub still reports the PR as open', async () => {
    const state = makeState(makeCard());
    const { host, getPrMergeStateMock } = createHost(state);
    getPrMergeStateMock.mockResolvedValue('open');

    const monitor = new AutoMergeMonitor(host);
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, state);

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(getPrMergeStateMock).toHaveBeenCalledTimes(2);
  });

  it('clears pending polls when auto-merge monitoring is disabled for the workspace', async () => {
    const card = makeCard();
    const enabledState = makeState(card);
    const disabledState = makeState(card, makeSettings({ yoloAutoMergePrs: false }));
    const { host, getPrMergeStateMock } = createHost(enabledState);

    const monitor = new AutoMergeMonitor(host);
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, enabledState);
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, disabledState);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(getPrMergeStateMock).not.toHaveBeenCalled();
  });
});
