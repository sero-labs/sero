import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import { executePlanning } from '@electron/features/kanban/planning/planning-executor';
import type { Card } from '@electron/features/kanban/core/types';
import type { PlanningProgressTracker } from '@electron/features/kanban/planning/planning-progress';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test feature',
    description: 'Implement test feature',
    acceptance: ['Feature works'],
    priority: 'medium',
    column: 'planning',
    status: 'agent-working',
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTracker(): PlanningProgressTracker {
  return {
    setPhase: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    addAgent: vi.fn(),
    completeAgent: vi.fn(),
    addLogLine: vi.fn(),
    setLiveOutput: vi.fn(),
  } as unknown as PlanningProgressTracker;
}

function makeSubagentTracker() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    get: vi.fn(),
  };
}

describe('executePlanning', () => {
  it('uses the structured plan submission tool when the planner calls it', async () => {
    const runSingleStructured = vi.fn().mockImplementation(async (params: { customTools?: ToolDefinition[] }) => {
      const tool = params.customTools?.find((entry) => entry.name === 'kanban_submit_plan');
      expect(tool).toBeDefined();
      await tool!.execute('tool-call-1', {
        plan: 'Implement the feature in two steps.',
        subtasks: [
          {
            id: '1',
            title: 'Setup',
            description: 'Prepare the project',
            dependsOn: [],
            tddDesignation: 'no-test',
            filePaths: ['src/setup.ts'],
            complexity: 'low',
          },
          {
            id: '2',
            title: 'Ship feature',
            description: 'Build the feature',
            dependsOn: ['1'],
            tddDesignation: 'test-after',
            filePaths: ['src/feature.ts'],
            complexity: 'medium',
          },
        ],
      }, undefined, undefined, {} as never);
      return { response: 'plan submitted via tool' };
    });

    const result = await executePlanning(
      {
        subagentManager: {
          runSingleStructured,
          tracker: makeSubagentTracker(),
        } as never,
        workspaceId: 'workspace-1',
        planOptions: { testingEnabled: true },
      },
      makeCard(),
      makeTracker(),
      true,
    );

    expect(result.plan).toBe('Implement the feature in two steps.');
    expect(result.subtasks.map((subtask) => subtask.id)).toEqual(['1', '2']);
    expect(result.subtasks[0]?.status).toBe('pending');
  });

  it('uses a single planner run for existing projects too', async () => {
    const tracker = makeTracker();
    const runSingleStructured = vi.fn().mockResolvedValue({
      response: '```json\n{"plan":"Existing project plan","subtasks":[{"id":"1","title":"Inspect and ship","description":"Do it","dependsOn":[]}]}\n```',
    });

    const result = await executePlanning(
      {
        subagentManager: {
          runSingleStructured,
          tracker: makeSubagentTracker(),
        } as never,
        workspaceId: 'workspace-1',
      },
      makeCard(),
      tracker,
      false,
    );

    expect(runSingleStructured).toHaveBeenCalledTimes(1);
    expect(runSingleStructured.mock.calls[0][0].task).toContain('Inspect the current codebase yourself');
    expect(tracker.addAgent).toHaveBeenCalledWith('planner');
    expect(tracker.setPhase).toHaveBeenCalledWith('Inspecting codebase and drafting plan');
    expect(result.plan).toBe('Existing project plan');
  });

  it('falls back to parsing planner JSON when no tool submission is provided', async () => {
    const runSingleStructured = vi.fn().mockResolvedValue({
      response: '```json\n{"plan":"Fallback plan","subtasks":[{"id":"1","title":"Only step","description":"Do it","dependsOn":[]}]}\n```',
    });

    const result = await executePlanning(
      {
        subagentManager: {
          runSingleStructured,
          tracker: makeSubagentTracker(),
        } as never,
        workspaceId: 'workspace-1',
      },
      makeCard(),
      makeTracker(),
      true,
    );

    expect(result.plan).toBe('Fallback plan');
    expect(result.subtasks).toHaveLength(1);
    expect(result.subtasks[0]?.title).toBe('Only step');
  });
});
