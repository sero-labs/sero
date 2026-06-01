import { describe, expect, it } from 'vitest';

import { systemToolCandidates } from '@electron/features/workspace/runtime/toolchains/system-candidates';

describe('system tool candidates', () => {
  it('uses absolute POSIX fallback paths when app launch PATH is sparse', () => {
    expect(systemToolCandidates('git', 'darwin', {})).toEqual(expect.arrayContaining([
      'git',
      '/usr/bin/git',
      '/opt/homebrew/bin/git',
    ]));
    expect(systemToolCandidates('bash', 'linux', {})).toEqual(expect.arrayContaining([
      'bash',
      '/bin/bash',
      '/usr/bin/bash',
    ]));
  });

  it('converts Git Bash/MSYS PATH entries to Windows executable candidates', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      PATH: '/c/hostedtoolcache/windows/node/22.20.0/x64:/mingw64/bin:/usr/bin',
      PNPM_HOME: 'C:\\Users\\runneradmin\\setup-pnpm\\node_modules\\.bin',
      SystemRoot: 'C:\\Windows',
    };

    expect(systemToolCandidates('npm', 'win32', env)).toEqual(expect.arrayContaining([
      'C:\\hostedtoolcache\\windows\\node\\22.20.0\\x64\\npm.cmd',
      'npm',
    ]));
    expect(systemToolCandidates('pnpm', 'win32', env)).toEqual(expect.arrayContaining([
      'C:\\Users\\runneradmin\\setup-pnpm\\node_modules\\.bin\\pnpm.cmd',
    ]));
    expect(systemToolCandidates('bash', 'win32', env)).toEqual(expect.arrayContaining([
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    ]));
  });

  it('keeps Windows PATH drive letters intact', () => {
    const env = {
      Path: 'C:\\Tools\\node;D:\\Git\\cmd',
      ProgramFiles: 'C:\\Program Files',
    };

    expect(systemToolCandidates('node', 'win32', env)).toEqual(expect.arrayContaining([
      'C:\\Tools\\node\\node.exe',
    ]));
  });
});
