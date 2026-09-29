import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toRuntimeCwd } from '@electron/features/workspace/runtime/runtime-paths';

describe('toRuntimeCwd', () => {
  it('maps a folder inside the workspace to its /workspace path', () => {
    expect(toRuntimeCwd('/Users/me/project', '/Users/me/project/packages/app')).toBe('/workspace/packages/app');
  });

  it('maps a folder named by its real path when the workspace is registered by a link', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-cwd-'));
    const real = path.join(root, 'real');
    const link = path.join(root, 'link');
    fs.mkdirSync(path.join(real, 'sub'), { recursive: true });
    fs.symlinkSync(real, link);
    try {
      expect(toRuntimeCwd(link, path.join(fs.realpathSync(real), 'sub'))).toBe('/workspace/sub');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a folder outside the workspace at the path the runtime mounts it', () => {
    expect(toRuntimeCwd('/Users/me/project', '/Users/me/other')).toBe('/Users/me/other');
  });
});
