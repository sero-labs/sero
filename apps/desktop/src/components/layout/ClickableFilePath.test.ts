import { describe, expect, it } from 'vitest';
import { toEditorVirtualPath } from './ClickableFilePath';

describe('toEditorVirtualPath', () => {
  it('opens bare project-relative paths under the workspace virtual root', () => {
    expect(toEditorVirtualPath('docs/reference/state-and-folders.md')).toBe(
      '/workspace/docs/reference/state-and-folders.md',
    );
  });

  it('opens dot-relative paths under the workspace virtual root', () => {
    expect(toEditorVirtualPath('./src/main.ts')).toBe('/workspace/src/main.ts');
  });

  it('preserves already-rooted virtual paths', () => {
    expect(toEditorVirtualPath('/workspace/src/main.ts')).toBe('/workspace/src/main.ts');
    expect(toEditorVirtualPath('/sero-source/package.json')).toBe('/sero-source/package.json');
  });
});
