import { describe, expect, it } from 'vitest';
import { toWorkspacePath } from './repo-paths';

const WS = '/home/dan/code/app';

describe('toWorkspacePath', () => {
  it('leaves the path alone when the workspace is the repo', () => {
    expect(toWorkspacePath(WS, WS, 'src/index.ts')).toBe('src/index.ts');
    expect(toWorkspacePath(`${WS}/`, WS, 'src/index.ts')).toBe('src/index.ts');
  });

  it('prefixes the offset when the repo sits inside the workspace', () => {
    expect(toWorkspacePath(WS, `${WS}/packages/core`, 'src/index.ts'))
      .toBe('packages/core/src/index.ts');
  });

  it('strips the offset when the workspace is a subdirectory of the repo', () => {
    expect(toWorkspacePath(`${WS}/packages/core`, WS, 'packages/core/src/index.ts'))
      .toBe('src/index.ts');
  });

  it('returns null for a repo file outside the workspace', () => {
    // The host refuses to read outside the workspace, so the diff must report
    // that rather than treat the missing side as an empty file.
    expect(toWorkspacePath(`${WS}/packages/core`, WS, 'packages/ui/src/index.ts')).toBeNull();
    expect(toWorkspacePath(WS, '/home/dan/other-repo', 'src/index.ts')).toBeNull();
  });

  it('handles Windows separators', () => {
    expect(toWorkspacePath('C:\\code\\app', 'C:\\code\\app', 'src/index.ts')).toBe('src/index.ts');
  });
});
