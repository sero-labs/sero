import { describe, expect, it, vi } from 'vitest';

import type { KanbanRuntimeHost } from '../types';
import type { Card, KanbanSettings, KanbanState } from './types';
import type { OrchestratorDeps } from './orchestrator-types';
import type { WatchedWorkspaceEntry } from './workspace-watch';
import {
  recoverStuckCards,
  runDoneCleanup,
  type OrchestratorPhaseContext,
} from './orchestrator-phase-runners';

function makeSettings(overrides: Partial<KanbanSettings> = {}): KanbanSettings {
  return {
    autoAdvance: true,
    reviewMode: 'full',
    testingEnabled: true,
    yoloMode: false,
    yoloAutoMergePrs: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test card',
    description: 'A test card',
    acceptance: ['It works'],
    priority: 'medium',
    column: 'backlog',
    status: 'idle',
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(cards: Card[], settings: KanbanSettings = makeSettings()): KanbanState {
  return {
    cards,
    nextId: cards.length + 1,
    settings,
  };
}

function createHost(initialState: KanbanState): {
  host: KanbanRuntimeHost;
  getState: () => KanbanState | null;
} {
  let currentState: KanbanState | null = initialState;

  const host = {
    appState: {
      read: async <T = unknown>() => currentState as T | null,
      update: async <T = unknown>(
        _filePath: string,
        updater: (current: T | null) => T,
      ) => {
        currentState = updater(currentState as T | null) as unknown as KanbanState;
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
      refreshAfterSync: async () => ({
        refreshed: false,
        dependenciesInstalled: false,
        restartedServerIds: [],
      }),
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
      createWorktree: async () => ({ worktreePath: '/tmp/worktree', branchName: 'feat/test-1', greenfield: false }),
      removeWorktree: async () => {},
      syncWorktreeWithDefaultBranch: async () => ({ success: true, updated: false, resolvedConflicts: false }),
      syncWorkspaceRootToDefaultBranch: async () => ({ synced: true }),
      createCheckpoint: async () => 'checkpoint-1',
      getDiffSummary: async () => '',
      getDiff: async () => '',
      pushBranch: async () => true,
      ensureRemoteDefaultBranch: async () => 'main',
      createPr: async () => ({ success: true as const, url: 'https://example.test/pr/1', number: 1 }),
      mergePr: async () => ({ success: true as const, state: 'merged' as const }),
      getPrMergeState: async () => 'unknown' as const,
      getPrMergeError: async () => null,
    },
    devServers: {
      startManaged: async () => ({ reason: 'not-used' }),
      list: () => [],
      stop: async () => false,
      restart: async () => false,
      unregister: () => false,
    },
  } satisfies KanbanRuntimeHost;

  return {
    host,
    getState: () => currentState,
  };
}

function createDeps(host: KanbanRuntimeHost, stateFilePath: string): OrchestratorDeps {
  return {
    host,
    workspaceId: 'workspace-1',
    workspacePath: '/tmp/workspace',
    stateFilePath,
    getWorkspacePath: () => '/tmp/workspace',
    findWorkspaceByPath: () => ({ id: 'workspace-1', path: '/tmp/workspace' }),
  };
}

describe('kanban runtime orchestration helpers', () => {
  it('retries stuck cards during startup recovery', async () => {
    const stuckCard = makeCard({ column: 'planning', status: 'agent-working' });
    const state = makeState([stuckCard]);
    const { host } = createHost(state);
    const stateFilePath = '/tmp/workspace/.sero/apps/kanban/state.json';
    const deps = createDeps(host, stateFilePath);
    const watched = new Map<string, WatchedWorkspaceEntry>();
    const handleTransition = vi.fn(async () => {});
    const watchWorkspace = vi.fn(async (workspaceId: string, _workspacePath: string) => {
      watched.set(workspaceId, {
        workspaceId,
        stateFilePath,
        lastColumnMap: new Map([[stuckCard.id, stuckCard.column]]),
        lastCardMap: new Map([[stuckCard.id, stuckCard]]),
      });
    });

    await recoverStuckCards(
      { deps, handleTransition },
      watched,
      watchWorkspace,
      [{ id: 'workspace-1', path: '/tmp/workspace' }],
    );

    expect(watchWorkspace).toHaveBeenCalledWith('workspace-1', '/tmp/workspace');
    expect(handleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1' }),
      expect.objectContaining({ id: stuckCard.id }),
      'planning',
    );
  });

  it('auto-starts newly unblocked backlog cards after done cleanup', async () => {
    const completed = makeCard({ id: '1', column: 'done', status: 'waiting-input', completedAt: '2026-01-01T00:00:00.000Z' });
    const blocked = makeCard({ id: '2', title: 'Follow-up card', blockedBy: ['1'] });
    const state = makeState([completed, blocked], makeSettings({ autoAdvance: true, yoloMode: false }));
    const { host, getState } = createHost(state);
    const stateFilePath = '/tmp/workspace/.sero/apps/kanban/state.json';
    const deps = createDeps(host, stateFilePath);
    const handleTransition = vi.fn(async () => {});
    const context: OrchestratorPhaseContext = {
      deps,
      processing: {
        planningInProgress: new Set(),
        implementationInProgress: new Set(),
        reviewInProgress: new Set(),
      },
      handleTransition,
      isCurrentlyProcessing: () => false,
    };
    const workspace: WatchedWorkspaceEntry = {
      workspaceId: 'workspace-1',
      stateFilePath,
      lastColumnMap: new Map([[completed.id, completed.column], [blocked.id, blocked.column]]),
      lastCardMap: new Map([[completed.id, completed], [blocked.id, blocked]]),
    };

    await runDoneCleanup(context, workspace, completed);

    const nextState = getState();
    expect(nextState?.cards.find((card) => card.id === '2')).toMatchObject({
      column: 'planning',
      status: 'agent-working',
    });
    expect(handleTransition).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ id: '2', title: 'Follow-up card' }),
      'planning',
    );
  });
});
