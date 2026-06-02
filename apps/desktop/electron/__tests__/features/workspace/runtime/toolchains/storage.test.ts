import path from 'path';

import { describe, expect, it } from 'vitest';

import { SERO_AGENT_DIR, SERO_FIXED_ROOT, SERO_HOME, SERO_HOST_ARTIFACTS_ROOT } from '@electron/platform/env';
import {
  INSTALLED_MARKER,
  STAGING_SUFFIX,
  artifactInstallPath,
  artifactStagingPath,
  installedMarkerPath,
  managedBinPath,
  selectToolchainGcCandidates,
  toolchainStagingRoot,
  toolchainVersionRoot,
  toolchainsRoot,
} from '@electron/features/workspace/runtime/toolchains/storage';

function expectUnderToolchainsRoot(value: string, version = '2026.05.16'): void {
  const expectedRoot = path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains', version);
  expect(path.relative(expectedRoot, value).startsWith('..')).toBe(false);
}

describe('toolchain storage paths', () => {
  it('roots managed toolchains under the host artifacts root', () => {
    expect(toolchainsRoot()).toBe(path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains'));
    expect(toolchainVersionRoot('2026.05.16')).toBe(
      path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains', '2026.05.16'),
    );
  });

  it('does not use profile-local or Pi agent directories', () => {
    const root = toolchainVersionRoot('2026.05.16');
    expect(root.startsWith(SERO_HOME + path.sep)).toBe(SERO_HOME === SERO_FIXED_ROOT);
    expect(root.startsWith(SERO_AGENT_DIR + path.sep)).toBe(false);
    expect(root).not.toContain(`${path.sep}.pi${path.sep}agent`);
  });

  it('builds activation marker and staging paths deterministically', () => {
    expect(installedMarkerPath('2026.05.16')).toBe(
      path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains', '2026.05.16', INSTALLED_MARKER),
    );
    expect(toolchainStagingRoot('2026.05.16')).toBe(
      `${path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains', '2026.05.16')}${STAGING_SUFFIX}`,
    );
    expect(artifactStagingPath('2026.05.16', 'node')).toBe(
      path.join(SERO_HOST_ARTIFACTS_ROOT, 'toolchains', `2026.05.16${STAGING_SUFFIX}`, 'node'),
    );
  });

  it('keeps artifact and bin helpers under the version root', () => {
    const artifact = artifactInstallPath('2026.05.16', 'node');
    const bin = managedBinPath('2026.05.16', 'node/bin/node');
    expectUnderToolchainsRoot(artifact);
    expectUnderToolchainsRoot(bin);
  });

  it('rejects path traversal in version and relative artifact paths', () => {
    expect(() => toolchainVersionRoot('../bad')).toThrow(/Invalid toolchain manifest version/);
    expect(() => artifactInstallPath('2026.05.16', '../bad')).toThrow(/escapes fixed root/);
    expect(() => managedBinPath('2026.05.16', '/usr/bin/node')).toThrow(/Invalid toolchain relative path/);
  });

  it('selects garbage-collection candidates by keeping current and previous versions', () => {
    expect(selectToolchainGcCandidates({
      versions: ['2026.05.14', '2026.05.15', '2026.05.16', '2026.05.13'],
      currentVersion: '2026.05.16',
      previousVersion: '2026.05.15',
    })).toEqual(['2026.05.13', '2026.05.14']);
  });
});
