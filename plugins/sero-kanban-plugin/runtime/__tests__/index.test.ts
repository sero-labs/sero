import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRuntime, KanbanRuntime } from '../index';
import type { KanbanRuntimeContext } from '../types';
import type { Card, KanbanSettings, KanbanState } from '../core/types';
import { buildAutoMergePendingMessage } from '../quality/auto-merge-monitor';

function createContext(): KanbanRuntimeContext {
  return {
    appId: 'kanban',
    workspaceId: 'ws-1',
    workspacePath: '/tmp/workspace',
    stateFilePath: '/tmp/workspace/.sero/apps/kanban/state.json',
    host: {
      appState: {
        read: async () => null,
        update: async () => {},
        watch: () => {},
        unwatch: () => {},
      },
      subagents: {
        runStructured: async () => ({ response: '' }),
        onLiveOutput: () => () => {},
      },
      workspace: {
        runCommand: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        refreshAfterSync: async () => ({
          refreshed: false,
          dependenciesInstalled: false,
          restartedServerIds: [],
        }),
        resolveRuntime: async () => ({
          workspaceId: 'ws-1',
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
        getPrMergeState: async () => 'unknown',
        getPrMergeError: async () => null,
      },
      devServers: {
        startManaged: async () => ({ reason: 'not-used' }),
        list: () => [],
        stop: async () => false,
        restart: async () => false,
        unregister: () => false,
      },
    },
  };
}

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

function createStatefulContext(initialState: KanbanState, mergeState: 'merged' | 'open' = 'merged') {
  let currentState: KanbanState | null = initialState;
  const ctx = createContext();

  ctx.host.appState.read = async <T = unknown>() => currentState as T | null;
  ctx.host.appState.update = async <T = unknown>(
    _filePath: string,
    updater: (current: T | null) => T,
  ) => {
    currentState = updater(currentState as T | null) as unknown as KanbanState;
  };
  ctx.host.git.getPrMergeState = async () => mergeState;

  return { ctx, getState: () => currentState };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('kanban runtime scaffold', () => {
  it('creates a runtime instance with the shared app runtime module shape', async () => {
    const runtime = createAppRuntime(createContext());

    expect(runtime).toBeInstanceOf(KanbanRuntime);
    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.handleStateChange({ cards: [] })).resolves.toBeUndefined();
    await expect(runtime.dispose()).resolves.toBeUndefined();
  });

  it('wires auto-merge monitoring through the runtime orchestrator', async () => {
    vi.useFakeTimers();
    const state: KanbanState = {
      cards: [makeCard()],
      nextId: 2,
      settings: makeSettings(),
    };
    const { ctx, getState } = createStatefulContext(state, 'merged');
    const runtime = createAppRuntime(ctx);

    await runtime.handleStateChange(state);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(getState()?.cards[0]).toMatchObject({
      column: 'done',
      status: 'idle',
      error: undefined,
    });
  });
});
