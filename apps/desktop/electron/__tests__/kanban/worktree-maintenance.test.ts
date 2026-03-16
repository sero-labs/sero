import { describe, expect, it } from 'vitest';

import {
  extractStatusPath,
  isIgnoredWorkspaceStatusPath,
} from '../../kanban/worktree-maintenance';

describe('extractStatusPath', () => {
  it('extracts a regular porcelain status path', () => {
    expect(extractStatusPath('?? src/App.tsx')).toBe('src/App.tsx');
  });

  it('extracts the destination path for renames', () => {
    expect(extractStatusPath('R  old.ts -> new.ts')).toBe('new.ts');
  });
});

describe('isIgnoredWorkspaceStatusPath', () => {
  it('ignores Sero orchestration state paths', () => {
    expect(isIgnoredWorkspaceStatusPath('.sero/apps/kanban/state.json')).toBe(true);
    expect(isIgnoredWorkspaceStatusPath('.sero/worktrees/card-3/src/App.tsx')).toBe(true);
  });

  it('ignores workspace metadata but keeps real repo files', () => {
    expect(isIgnoredWorkspaceStatusPath('.sero-workspace.json')).toBe(true);
    expect(isIgnoredWorkspaceStatusPath('src/App.tsx')).toBe(false);
  });
});
