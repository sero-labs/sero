/**
 * The workspace tree reads this index through `ArchitectIndexView` in
 * @sero-ai/common. This test is the proof that the shape it declares is the
 * shape written here: if a field the tree needs is renamed or narrowed, the
 * assignment below stops compiling.
 */

import { describe, expect, it } from 'vitest';
import { projectAttention, type ArchitectIndexView } from '@sero-ai/common';
import type { ArchitectIndex } from '../types';

const index: ArchitectIndex = {
  version: 1,
  projects: [
    {
      id: 'p1',
      name: 'Sero docs',
      workspaceId: 'ws-1',
      phase: 'build',
      overlay: null,
      activity: {
        state: 'stopped',
        headline: 'Stopped by the spend cap',
        owner: 'No paid work can start until the cap is raised',
        action: 'Raise the cap',
      },
      milestones: { accepted: 1, total: 3 },
      spentUsd: 12,
      capUsd: 12,
      needsYou: 0,
      updatedAt: '2026-09-19T00:00:00.000Z',
    },
  ],
};

describe('the Architect index as the shell reads it', () => {
  it('is assignable to the shared view', () => {
    const view: ArchitectIndexView = index;
    expect(view.projects[0].workspaceId).toBe('ws-1');
  });

  it('carries enough for the shell to state what the project needs', () => {
    const view: ArchitectIndexView = index;
    expect(projectAttention(view.projects[0])).toEqual({
      state: 'stopped',
      cause: 'Stopped by the spend cap',
      headline: 'Stopped by the spend cap',
      action: 'Raise the cap',
    });
  });

  it('claims nothing for a project written before activity existed', () => {
    // An index on disk outlives the version that wrote it. The shell reads it
    // on upgrade, before the Architect runs again and rewrites it, so the cast
    // here is the only way to build the shape that actually arrives.
    const legacy = {
      ...index.projects[0],
      activity: undefined,
    } as unknown as ArchitectIndexView['projects'][number];

    expect(projectAttention(legacy)).toBeNull();
  });
});
