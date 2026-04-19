import { describe, expect, it } from 'vitest';

import { createAppRuntime, KanbanRuntime } from '../index';
import type { KanbanRuntimeContext } from '../types';

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
      },
      verification: {
        detectCompileCommands: async () => [],
        detectDependencyInstallCommand: async () => null,
        detectDevServerCommand: async () => null,
        detectVerificationCommands: async () => [],
        runCommands: async () => ({ success: true, results: [] }),
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
        createPr: async () => ({ success: true, url: 'https://example.test/pr/1', number: 1 }),
        mergePr: async () => ({ success: true, state: 'merged' }),
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

describe('kanban runtime scaffold', () => {
  it('creates a runtime instance with the shared app runtime module shape', async () => {
    const runtime = createAppRuntime(createContext());

    expect(runtime).toBeInstanceOf(KanbanRuntime);
    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.handleStateChange({ cards: [] })).resolves.toBeUndefined();
    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
