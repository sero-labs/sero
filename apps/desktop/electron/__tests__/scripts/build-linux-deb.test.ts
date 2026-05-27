import { describe, expect, it } from 'vitest';

import {
  buildFeedYaml,
  channelFromVersion,
  updateInfoFileName,
} from '../../../scripts/build-linux-deb.mjs';

describe('build-linux-deb feed helpers', () => {
  it('derives the channel from the semver prerelease tag', () => {
    expect(channelFromVersion('0.1.2-beta.0')).toBe('beta');
    expect(channelFromVersion('1.0.0-alpha.3')).toBe('alpha');
    expect(channelFromVersion('1.0.0')).toBe('latest');
    // Build metadata must not leak into the channel name.
    expect(channelFromVersion('1.0.0-beta.1+build.7')).toBe('beta');
  });

  it('matches electron-updater Linux channel file naming', () => {
    expect(updateInfoFileName('beta', 'x64')).toBe('beta-linux.yml');
    expect(updateInfoFileName('beta', 'arm64')).toBe('beta-linux-arm64.yml');
    expect(updateInfoFileName('latest', 'x64')).toBe('latest-linux.yml');
  });

  it('writes a parseable UpdateInfo feed with matching path/sha512', () => {
    const yaml = buildFeedYaml({
      version: '0.1.2-beta.0',
      artifactName: 'Sero-0.1.2-beta.0-linux-x64.deb',
      sha512: 'abc123==',
      size: 4096,
      releaseDate: '2026-05-27T00:00:00.000Z',
    });
    expect(yaml).toContain('version: 0.1.2-beta.0');
    expect(yaml).toContain('  - url: Sero-0.1.2-beta.0-linux-x64.deb');
    expect(yaml).toContain('    sha512: abc123==');
    expect(yaml).toContain('    size: 4096');
    expect(yaml).toContain('path: Sero-0.1.2-beta.0-linux-x64.deb');
    expect(yaml).toContain("releaseDate: '2026-05-27T00:00:00.000Z'");
  });
});
