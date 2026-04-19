import { describe, expect, it } from 'vitest';
import { toWorkspaceContainerPath } from '@electron/features/workspace/runtime/container-path';

describe('toWorkspaceContainerPath', () => {
  const workspacePath = '/tmp/workspace';

  it('maps the workspace root to /workspace', () => {
    expect(toWorkspaceContainerPath(workspacePath, workspacePath)).toBe('/workspace');
  });

  it('maps nested host paths into the container workspace mount', () => {
    expect(toWorkspaceContainerPath(workspacePath, '/tmp/workspace/src/index.ts')).toBe('/workspace/src/index.ts');
  });

  it('rejects paths outside the workspace root', () => {
    expect(toWorkspaceContainerPath(workspacePath, '/tmp/other/file.ts')).toBeNull();
  });
});
