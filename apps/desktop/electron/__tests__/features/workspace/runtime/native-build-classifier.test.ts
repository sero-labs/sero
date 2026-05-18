import { describe, expect, it } from 'vitest';

import {
  classifyNativeBuildFailure,
  createNativeBuildToolsRequiredMetadata,
} from '@electron/features/workspace/runtime/native-build/classifier';

describe('native build failure classifier', () => {
  it('classifies node-gyp failures', () => {
    const failure = classifyNativeBuildFailure({
      command: 'pnpm install',
      exitCode: 1,
      stdout: '',
      stderr: 'npm ERR! gyp ERR! build error\nnode-gyp rebuild failed',
      platform: 'linux',
    });

    expect(failure).toMatchObject({ kind: 'node-gyp', executable: 'node-gyp' });
  });

  it.each([
    ['make: command not found', 'missing-make', 'make'],
    ['spawn gcc ENOENT', 'missing-gcc', 'gcc'],
    ['g++: not found', 'missing-gpp', 'g++'],
    ['clang: command not found', 'missing-clang', 'clang'],
  ] as const)('classifies missing POSIX build executable: %s', (stderr, kind, executable) => {
    const failure = classifyNativeBuildFailure({
      command: 'npm install',
      exitCode: 127,
      stdout: '',
      stderr,
      platform: 'linux',
    });

    expect(failure).toMatchObject({ kind, executable });
  });

  it('classifies missing MSVC and Visual Studio Build Tools on Windows', () => {
    const failure = classifyNativeBuildFailure({
      command: 'npm install',
      exitCode: 1,
      stdout: '',
      stderr: 'gyp ERR! find VS could not find any Visual Studio installation to use',
      platform: 'win32',
    });

    expect(failure).toMatchObject({ kind: 'missing-msvc' });
  });

  it('classifies missing Xcode Command Line Tools on macOS', () => {
    const failure = classifyNativeBuildFailure({
      command: 'pnpm install',
      exitCode: 1,
      stdout: '',
      stderr: 'xcrun: error: invalid active developer path, missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun',
      platform: 'darwin',
    });

    expect(failure).toMatchObject({ kind: 'missing-xcode-clt' });
  });

  it('classifies missing Python for node-gyp', () => {
    const failure = classifyNativeBuildFailure({
      command: 'npm install',
      exitCode: 1,
      stdout: '',
      stderr: 'gyp ERR! find Python Python is not set from command line or npm configuration',
      platform: 'linux',
    });

    expect(failure).toMatchObject({ kind: 'missing-python', executable: 'python' });
  });

  it('does not classify unrelated package-manager failures', () => {
    const failure = classifyNativeBuildFailure({
      command: 'pnpm install',
      exitCode: 1,
      stdout: '',
      stderr: 'ERR_PNPM_OUTDATED_LOCKFILE Cannot install with frozen-lockfile',
      platform: 'linux',
    });

    expect(failure).toBeNull();
  });

  it('creates non-installable metadata with setup action by default', () => {
    const failure = classifyNativeBuildFailure({
      command: 'pnpm install',
      exitCode: 1,
      stdout: '',
      stderr: 'make: command not found',
      platform: 'linux',
    });

    expect(failure).not.toBeNull();
    const metadata = createNativeBuildToolsRequiredMetadata(failure!);

    expect(metadata).toMatchObject({
      code: 'NATIVE_BUILD_TOOLS_REQUIRED',
      seroInstallable: false,
    });
    expect(metadata.actions.map((action) => action.type)).toContain('setup-container-runtime');
    expect(metadata.actions.map((action) => action.type)).not.toContain('switch-workspace-runtime');
  });

  it('offers switch action only when a compatible container backend is supplied', () => {
    const failure = classifyNativeBuildFailure({
      command: 'npm install',
      exitCode: 1,
      stdout: '',
      stderr: 'node-gyp rebuild failed',
      platform: 'linux',
    });

    expect(failure).not.toBeNull();
    const metadata = createNativeBuildToolsRequiredMetadata(failure!, { backend: 'docker' });

    expect(metadata.actions).toContainEqual({
      type: 'switch-workspace-runtime',
      label: 'Switch workspace to container runtime',
      backend: 'docker',
    });
    expect(metadata.actions.map((action) => action.type)).not.toContain('setup-container-runtime');
  });
});
