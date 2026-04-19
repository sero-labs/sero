import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import { executeImplementation } from './implementation-executor';
import type { ImplementationProgressTracker } from './implementation-progress';
import type { Card, KanbanSettings, KanbanState } from '../../shared/types';
import type { KanbanRuntimeContext } from '../types';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-runtime-impl-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test feature',
    description: 'Implement the feature',
    acceptance: ['Feature works'],
    priority: 'medium',
    column: 'in-progress',
    status: 'agent-working',
    subtasks: [
      { id: '1', title: 'Setup', description: 'Prepare the project', status: 'pending', dependsOn: [] },
      { id: '2', title: 'Implement', description: 'Ship the feature', status: 'pending', dependsOn: ['1'] },
    ],
    plan: 'Do setup, then implement.',
    branch: 'feat/test-feature-1',
    worktreePath: '/tmp/worktree',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

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

function makeTracker(): ImplementationProgressTracker {
  return {
    setPhase: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    addAgent: vi.fn(),
    completeAgent: vi.fn(),
    addLogLine: vi.fn(),
    setLiveOutput: vi.fn(),
  } as unknown as ImplementationProgressTracker;
}

function createContext(
  stateFilePath: string,
  result: { response: string; error?: string },
  options?: {
    onRun?: (helpers: {
      emitLiveOutput: (text: string) => void;
      customTools: ToolDefinition[];
    }) => Promise<void>;
  },
): KanbanRuntimeContext {
  const listeners = new Set<(agentName: string, text: string) => void>();
  const emitLiveOutput = (text: string) => {
    for (const listener of listeners) {
      listener('implementer', text);
    }
  };

  return {
    appId: 'kanban',
    workspaceId: 'workspace-1',
    workspacePath: tmpDir,
    stateFilePath,
    host: {
      appState: {
        read: async <T>(filePath: string) => {
          try {
            return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
          } catch {
            return null;
          }
        },
        update: async <T>(filePath: string, updater: (current: T | null) => T) => {
          const current = await readState<T>(filePath);
          const next = updater(current);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8');
        },
        watch: () => {},
        unwatch: () => {},
      },
      subagents: {
        runStructured: vi.fn().mockImplementation(async (params: { customTools?: ToolDefinition[] }) => {
          await options?.onRun?.({
            emitLiveOutput,
            customTools: params.customTools ?? [],
          });
          return result;
        }),
        onLiveOutput: vi.fn((_workspaceId, _parentSessionId, cb) => {
          listeners.add(cb);
          return () => {
            listeners.delete(cb);
          };
        }),
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
          workspacePath: tmpDir,
          desiredRuntime: 'container',
          actualRuntime: 'container',
          containerEnabled: true,
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
          command: '',
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
        createCheckpoint: async () => 'checkpoint-1',
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

async function writeState(stateFilePath: string, card: Card, settings: KanbanSettings): Promise<void> {
  const state: KanbanState = {
    cards: [card],
    nextId: 2,
    settings,
  };
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

async function readState<T = KanbanState>(stateFilePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(stateFilePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function waitForAssertion(assertion: () => Promise<void>, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await assertion();
}

describe('executeImplementation', () => {
  it('runs a single implementer pass and completes all subtasks', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings();
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    const ctx = createContext(stateFilePath, { response: 'done' });
    const runVerification = vi.fn().mockResolvedValue(undefined);
    const createCheckpoint = vi.fn().mockResolvedValue('checkpoint-1');

    await executeImplementation(
      { host: ctx.host, workspaceId: ctx.workspaceId, settings },
      stateFilePath,
      card,
      '/tmp/worktree',
      tracker,
      { runVerification, createCheckpoint },
    );

    const saved = await readState<KanbanState>(stateFilePath);
    const runStructured = ctx.host.subagents.runStructured as ReturnType<typeof vi.fn>;

    expect(runStructured).toHaveBeenCalledTimes(1);
    expect(runStructured.mock.calls[0][0].task).toContain('one cohesive pass');
    expect(runVerification).toHaveBeenCalledTimes(1);
    expect(createCheckpoint).toHaveBeenCalledWith('/tmp/worktree', 'implementation: Test feature');
    expect(saved?.cards[0].subtasks.every((subtask) => subtask.status === 'completed')).toBe(true);
    expect(saved?.cards[0].lastCheckpoint).toBe('checkpoint-1');
    expect(tracker.addAgent).toHaveBeenCalledWith('implementer');
    expect(tracker.completeAgent).toHaveBeenCalledWith('implementer');
  });

  it('updates subtask progress as tool completions arrive', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings();
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    let releaseRun = () => {};
    const ctx = createContext(
      stateFilePath,
      { response: 'done' },
      {
        onRun: async ({ customTools }) => {
          const tool = customTools.find((entry) => entry.name === 'kanban_mark_subtask_complete');
          expect(tool).toBeDefined();
          await tool!.execute('tool-call-1', { subtaskId: '1' }, undefined, undefined, {} as never);
          await new Promise<void>((resolve) => {
            releaseRun = () => resolve();
          });
        },
      },
    );

    const execution = executeImplementation(
      { host: ctx.host, workspaceId: ctx.workspaceId, settings },
      stateFilePath,
      card,
      '/tmp/worktree',
      tracker,
      {
        runVerification: vi.fn().mockResolvedValue(undefined),
        createCheckpoint: vi.fn().mockResolvedValue('checkpoint-1'),
      },
    );

    try {
      await waitForAssertion(async () => {
        const saved = await readState<KanbanState>(stateFilePath);
        expect(saved?.cards[0].subtasks.map((subtask) => subtask.status)).toEqual([
          'completed',
          'in-progress',
        ]);
      });
    } finally {
      releaseRun();
    }

    await execution;
  });

  it('falls back to legacy marker parsing when a tool call is not used', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings();
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    let releaseRun = () => {};
    const ctx = createContext(
      stateFilePath,
      { response: 'done' },
      {
        onRun: async ({ emitLiveOutput }) => {
          emitLiveOutput('Working through setup... SUBTASK_COMPLETE: 1');
          await new Promise<void>((resolve) => {
            releaseRun = () => resolve();
          });
        },
      },
    );

    const execution = executeImplementation(
      { host: ctx.host, workspaceId: ctx.workspaceId, settings },
      stateFilePath,
      card,
      '/tmp/worktree',
      tracker,
      {
        runVerification: vi.fn().mockResolvedValue(undefined),
        createCheckpoint: vi.fn().mockResolvedValue('checkpoint-1'),
      },
    );

    try {
      await waitForAssertion(async () => {
        const saved = await readState<KanbanState>(stateFilePath);
        expect(saved?.cards[0].subtasks.map((subtask) => subtask.status)).toEqual([
          'completed',
          'in-progress',
        ]);
      });
    } finally {
      releaseRun();
    }

    await execution;
  });

  it('skips implementation verification in light review mode', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings({ reviewMode: 'light', testingEnabled: false });
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    const ctx = createContext(stateFilePath, { response: 'done' });
    const runVerification = vi.fn().mockResolvedValue(undefined);
    const createCheckpoint = vi.fn().mockResolvedValue('checkpoint-1');

    await executeImplementation(
      { host: ctx.host, workspaceId: ctx.workspaceId, settings },
      stateFilePath,
      card,
      '/tmp/worktree',
      tracker,
      { runVerification, createCheckpoint },
    );

    expect(runVerification).not.toHaveBeenCalled();
    expect(tracker.addLogLine).toHaveBeenCalledWith(
      'Light prototype mode — skipping implementation-phase verification.',
    );
  });

  it('marks incomplete subtasks failed when the implementer fails', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings();
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    const ctx = createContext(stateFilePath, { response: '', error: 'implementation failed' });

    await expect(
      executeImplementation(
        { host: ctx.host, workspaceId: ctx.workspaceId, settings },
        stateFilePath,
        card,
        '/tmp/worktree',
        tracker,
      ),
    ).rejects.toThrow('implementation failed');

    const saved = await readState<KanbanState>(stateFilePath);
    expect(saved?.cards[0].subtasks.every((subtask) => subtask.status === 'failed')).toBe(true);
    expect(tracker.completeAgent).toHaveBeenCalledWith('implementer', 'failed');
  });
});
