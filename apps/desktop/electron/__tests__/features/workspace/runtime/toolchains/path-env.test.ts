import { describe, expect, it } from 'vitest';

import { addSeroCliEnv, managedSeroCliBinDir } from '@electron/cli/host-bridge/state';
import { pathEnvKey, pathEnvValue, prependPathEntries } from '@electron/features/workspace/runtime/toolchains/path-env';

describe('toolchain PATH env helpers', () => {
  it('uses PATH on POSIX and prepends entries without mutating the input env', () => {
    const env = { PATH: '/usr/bin', HOME: '/home/me' };
    const result = prependPathEntries(env, ['/managed/bin', '/other/bin'], 'linux');

    expect(pathEnvKey(env, 'linux')).toBe('PATH');
    expect(pathEnvValue(result, 'linux')).toBe('/managed/bin:/other/bin:/usr/bin');
    expect(result.HOME).toBe('/home/me');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('preserves existing Windows Path key casing', () => {
    const env = { Path: 'C:\\Windows\\System32' };
    const result = prependPathEntries(env, ['C:\\Sero\\bin'], 'win32');

    expect(pathEnvKey(env, 'win32')).toBe('Path');
    expect(result.Path).toBe('C:\\Sero\\bin;C:\\Windows\\System32');
    expect(result.PATH).toBeUndefined();
  });

  it('preserves existing Windows PATH uppercase casing', () => {
    const env = { PATH: 'C:\\Windows\\System32' };
    const result = prependPathEntries(env, ['C:\\Sero\\bin'], 'win32');

    expect(pathEnvKey(env, 'win32')).toBe('PATH');
    expect(result.PATH).toBe('C:\\Sero\\bin;C:\\Windows\\System32');
    expect(result.Path).toBeUndefined();
  });

  it('creates Path on Windows when no path key exists and keeps user env values', () => {
    const result = prependPathEntries({ USERPROFILE: 'C:\\Users\\me' }, ['C:\\Sero\\bin'], 'win32');

    expect(result.Path).toBe('C:\\Sero\\bin');
    expect(result.USERPROFILE).toBe('C:\\Users\\me');
  });

  it('removes conflicting Windows path key casing while preserving the selected key', () => {
    const env = { PATH: 'C:\\Windows\\System32', Path: 'C:\\Other' };
    const result = prependPathEntries(env, ['C:\\Sero\\bin'], 'win32');

    expect(result.PATH).toBe('C:\\Sero\\bin;C:\\Windows\\System32');
    expect(result.Path).toBeUndefined();
  });

  it('adds Sero CLI env using existing Windows Path casing without adding PATH', () => {
    const result = addSeroCliEnv({ Path: 'C:\\Windows\\System32' }, { workspaceId: 'ws-1' }, 'win32');

    expect(result.Path).toBe(`${managedSeroCliBinDir()};C:\\Windows\\System32`);
    expect(result.PATH).toBeUndefined();
    expect(result.SERO_WORKSPACE_ID).toBe('ws-1');
  });

  it('adds Sero CLI env using existing Windows PATH casing', () => {
    const result = addSeroCliEnv({ PATH: 'C:\\Windows\\System32' }, { workspaceId: 'ws-1' }, 'win32');

    expect(result.PATH).toBe(`${managedSeroCliBinDir()};C:\\Windows\\System32`);
    expect(result.Path).toBeUndefined();
  });

  it('adds Sero CLI env with Path on Windows when no path key exists', () => {
    const result = addSeroCliEnv({ USERPROFILE: 'C:\\Users\\me' }, { workspaceId: 'ws-1' }, 'win32');

    expect(result.Path).toBe(managedSeroCliBinDir());
    expect(result.PATH).toBeUndefined();
    expect(result.USERPROFILE).toBe('C:\\Users\\me');
  });
});
