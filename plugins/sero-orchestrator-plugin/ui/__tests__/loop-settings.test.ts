/**
 * The originating Architect project in the Workflow settings (spec
 * orchestrator-ui). The name is a creation-time snapshot for display; the link
 * target is the project id, so a rename still reaches the project.
 *
 * Pure, so the derivation is tested without rendering.
 */

import { describe, expect, it } from 'vitest';
import type { Loop } from '../../shared/types';
import { loopSettings } from '../lib/loop-settings';

function workflow(over: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    title: 'Reading tracker resilience',
    summary: '',
    prompt: '',
    status: 'active',
    workspace: { useManagedWorktree: false, allowDirtyWorkspaceRoot: false },
    runtime: { workspace: { resolved: null }, pendingEvents: [] },
    triggers: [],
    limits: {},
    plan: { steps: [], revision: 1 },
    warnings: [],
    ...over,
  } as unknown as Loop;
}

describe('the originating project in the Workflow settings', () => {
  it('names the project and keeps its id as the link target', () => {
    const loop = workflow({
      project: { projectId: 'proj_dungeon', runId: 'run-1', projectName: 'DungeonExplorer' },
    });

    expect(loopSettings(loop, []).project).toEqual({
      name: 'DungeonExplorer',
      projectId: 'proj_dungeon',
    });
  });

  it('shows no project value when the record has an id but no name', () => {
    const loop = workflow({ project: { projectId: 'proj_dungeon', runId: 'run-1' } });

    expect(loopSettings(loop, []).project).toBeNull();
  });

  it('shows no project value when the record names no project', () => {
    expect(loopSettings(workflow(), []).project).toBeNull();
  });
});
