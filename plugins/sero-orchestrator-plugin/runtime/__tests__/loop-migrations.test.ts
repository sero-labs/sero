import { describe, expect, it } from 'vitest';
import { migrateLoopState } from '../loop-migrations';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

describe('loop state migrations', () => {
  it('moves loops carrying the old dirty-prompt default to 60 seconds', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    loop.workspace.dirtyWorkspacePromptTimeoutMs = 30_000;

    expect(migrateLoopState(loop).workspace.dirtyWorkspacePromptTimeoutMs).toBe(60_000);
  });

  it('preserves a non-default timeout', () => {
    const loop = seedActiveLoop(createFakeHost(), oneStepPlan().plan);
    loop.workspace.dirtyWorkspacePromptTimeoutMs = 90_000;

    expect(migrateLoopState(loop)).toBe(loop);
  });
});
