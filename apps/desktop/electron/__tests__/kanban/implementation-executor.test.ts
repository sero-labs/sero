import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { executeImplementation } from '../../kanban/implementation-executor';
import type { Card, KanbanSettings, KanbanState } from '../../kanban/types';
import type { ImplementationProgressTracker } from '../../kanban/implementation-progress';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-impl-'));
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
    maxConcurrentCards: 3,
    requireApproval: { plan: true, pr: true },
    reviewLevel: 'per-wave',
    reviewMode: 'full',
    testingEnabled: true,
    yoloMode: false,
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

function makeSubagentManager(result: { response: string; error?: string }) {
  const runSingleStructured = vi.fn().mockResolvedValue(result);
  return {
    runSingleStructured,
    tracker: {
      on: vi.fn(),
      off: vi.fn(),
      get: vi.fn().mockReturnValue(null),
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

async function readState(stateFilePath: string): Promise<KanbanState> {
  return JSON.parse(await fs.readFile(stateFilePath, 'utf8')) as KanbanState;
}

describe('executeImplementation', () => {
  it('runs a single implementer pass and completes all subtasks', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings();
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    const subagentManager = makeSubagentManager({ response: 'done' });
    const runVerification = vi.fn().mockResolvedValue(undefined);
    const createCheckpoint = vi.fn().mockResolvedValue('checkpoint-1');

    await executeImplementation(
      { subagentManager: subagentManager as never, workspaceId: 'workspace-1', settings },
      stateFilePath,
      card,
      '/tmp/worktree',
      tracker,
      { runVerification, createCheckpoint },
    );

    const saved = await readState(stateFilePath);
    expect(subagentManager.runSingleStructured).toHaveBeenCalledTimes(1);
    expect(subagentManager.runSingleStructured.mock.calls[0][0].task).toContain('one cohesive pass');
    expect(runVerification).toHaveBeenCalledTimes(1);
    expect(createCheckpoint).toHaveBeenCalledWith('/tmp/worktree', 'implementation: Test feature');
    expect(saved.cards[0].subtasks.every((subtask) => subtask.status === 'completed')).toBe(true);
    expect(saved.cards[0].lastCheckpoint).toBe('checkpoint-1');
    expect(tracker.addAgent).toHaveBeenCalledWith('implementer');
    expect(tracker.completeAgent).toHaveBeenCalledWith('implementer');
  });

  it('skips implementation verification in light review mode', async () => {
    const stateFilePath = path.join(tmpDir, 'state.json');
    const card = makeCard();
    const settings = makeSettings({ reviewMode: 'light', testingEnabled: false });
    await writeState(stateFilePath, card, settings);

    const tracker = makeTracker();
    const subagentManager = makeSubagentManager({ response: 'done' });
    const runVerification = vi.fn().mockResolvedValue(undefined);
    const createCheckpoint = vi.fn().mockResolvedValue('checkpoint-1');

    await executeImplementation(
      { subagentManager: subagentManager as never, workspaceId: 'workspace-1', settings },
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
    const subagentManager = makeSubagentManager({ response: '', error: 'implementation failed' });

    await expect(
      executeImplementation(
        { subagentManager: subagentManager as never, workspaceId: 'workspace-1', settings },
        stateFilePath,
        card,
        '/tmp/worktree',
        tracker,
      ),
    ).rejects.toThrow('implementation failed');

    const saved = await readState(stateFilePath);
    expect(saved.cards[0].subtasks.every((subtask) => subtask.status === 'failed')).toBe(true);
    expect(tracker.completeAgent).toHaveBeenCalledWith('implementer', 'failed');
  });
});
