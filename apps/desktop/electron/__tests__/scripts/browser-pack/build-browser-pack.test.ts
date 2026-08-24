import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptUrl = pathToFileURL(path.join(process.cwd(), 'scripts/browser-pack/build-browser-pack.mjs')).href;

describe('build-browser-pack', () => {
  it('runs npm command shims through cmd on Windows', async () => {
    const { resolveRunCommand } = await import(scriptUrl);

    const command = process.env.ComSpec ?? 'cmd.exe';
    expect(resolveRunCommand('npx', 'win32')).toEqual({ command, prefixArgs: ['/d', '/s', '/c', 'npx.cmd'] });
    expect(resolveRunCommand('npm', 'win32')).toEqual({ command, prefixArgs: ['/d', '/s', '/c', 'npm.cmd'] });
    expect(resolveRunCommand('tar', 'win32')).toEqual({ command: 'tar', prefixArgs: [] });
    expect(resolveRunCommand('npx', 'linux')).toEqual({ command: 'npx', prefixArgs: [] });
  });

  it('forces local tar paths on Windows drive-letter paths', async () => {
    const { tarPathArgs } = await import(scriptUrl);

    expect(tarPathArgs('win32')).toEqual(['--force-local']);
    expect(tarPathArgs('linux')).toEqual([]);
  });
});
