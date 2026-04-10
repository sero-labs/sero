import { describe, expect, it } from 'vitest';

import { resolveSubagentPaths } from '@electron/features/subagent/runtime/runner';

describe('resolveSubagentPaths', () => {
  it('keeps the container root at the workspace while targeting a worktree cwd', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/Users/me/project/.sero/worktrees/card-5',
    );

    expect(resolved.sessionPath).toBe('/Users/me/project/.sero/worktrees/card-5');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBe('/workspace/.sero/worktrees/card-5');
  });

  it('uses the workspace root directly when there is no cwd override', () => {
    const resolved = resolveSubagentPaths('/Users/me/project');

    expect(resolved.sessionPath).toBe('/Users/me/project');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });

  it('falls back cleanly when the override is outside the workspace root', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/tmp/outside',
    );

    expect(resolved.sessionPath).toBe('/tmp/outside');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });
});
