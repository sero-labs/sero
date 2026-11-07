import { describe, expect, it } from 'vitest';

import { resolveContainerPath } from '@electron/features/container/tools/tool-schemas';

describe('resolveContainerPath', () => {
  it('leaves an absolute POSIX path alone', () => {
    expect(resolveContainerPath('/workspace/src/index.ts')).toBe('/workspace/src/index.ts');
  });

  it('resolves a relative path against the basedir', () => {
    expect(resolveContainerPath('src/index.ts')).toBe('/workspace/src/index.ts');
    expect(resolveContainerPath('src/index.ts', '/custom')).toBe('/custom/src/index.ts');
  });

  // A host runtime hands the tools real host paths. Prepending the workspace root
  // to one produced /workspace/C:\..., which the host backend then refused as
  // outside the workspace, so a session could not read the shared Pi docs.
  it('leaves a Windows drive path alone, with either separator', () => {
    expect(resolveContainerPath('C:\\Users\\runner\\.sero-ui\\shared\\pi-docs\\README.md'))
      .toBe('C:\\Users\\runner\\.sero-ui\\shared\\pi-docs\\README.md');
    expect(resolveContainerPath('C:/Users/runner/.sero-ui/shared/pi-docs/README.md'))
      .toBe('C:/Users/runner/.sero-ui/shared/pi-docs/README.md');
  });

  it('leaves a UNC share alone', () => {
    expect(resolveContainerPath('\\\\server\\share\\README.md')).toBe('\\\\server\\share\\README.md');
  });
});
