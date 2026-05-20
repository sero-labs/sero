import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptUrl = pathToFileURL(path.join(process.cwd(), 'scripts/browser-pack/build-browser-pack.mjs')).href;

describe('build-browser-pack', () => {
  it('runs npm command shims through cmd on Windows', async () => {
    const { resolveRunCommand } = await import(scriptUrl);

    expect(resolveRunCommand('npx', 'win32')).toEqual({ command: 'npx.cmd', shell: true });
    expect(resolveRunCommand('npm', 'win32')).toEqual({ command: 'npm.cmd', shell: true });
    expect(resolveRunCommand('tar', 'win32')).toEqual({ command: 'tar', shell: false });
    expect(resolveRunCommand('npx', 'linux')).toEqual({ command: 'npx', shell: false });
  });

  it('forces local tar paths on Windows drive-letter paths', async () => {
    const { tarPathArgs } = await import(scriptUrl);

    expect(tarPathArgs('win32')).toEqual(['--force-local']);
    expect(tarPathArgs('linux')).toEqual([]);
  });
});
