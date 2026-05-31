import { describe, expect, it } from 'vitest';

import generatedArtifacts from '@electron/features/workspace/runtime/toolchains/generated-artifacts.json';
import {
  createTestToolchainManifest,
  findArtifactForPlatform,
  loadBundledToolchainManifest,
  validateToolchainManifest,
} from '@electron/features/workspace/runtime/toolchains/manifest';
import type { ArtifactSpec, ToolchainManifest } from '@electron/features/workspace/runtime/toolchains/types';

const sha256 = 'a'.repeat(64);

function artifact(overrides: Partial<ArtifactSpec> = {}): ArtifactSpec {
  return {
    tool: 'node',
    platform: 'darwin',
    arch: 'arm64',
    url: 'https://downloads.example.test/node.tar.gz',
    sha256,
    unpackTo: 'node',
    binPaths: { node: 'node/bin/node', npm: 'node/bin/npm' },
    minVersion: '22.0.0',
    installPolicy: 'core',
    ...overrides,
  };
}

function manifest(overrides: Partial<ToolchainManifest> = {}): ToolchainManifest {
  return {
    version: '2026.05.16',
    artifacts: { 'node-darwin-arm64': artifact() },
    ...overrides,
  };
}

describe('toolchain manifest helpers', () => {
  it('loads a bundled manifest for every core tool on supported host-first targets', () => {
    const loaded = loadBundledToolchainManifest();
    const coreTools = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'] as const;
    const targets = [
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'linux', arch: 'arm64' },
      { platform: 'linux', arch: 'x64' },
      { platform: 'win32', arch: 'x64' },
    ] as const;

    expect(Object.keys(loaded.artifacts).length).toBe(coreTools.length * targets.length);
    for (const target of targets) {
      for (const tool of coreTools) {
        expect(findArtifactForPlatform(loaded, tool, target.platform, target.arch)).toMatchObject({
          tool,
          platform: target.platform,
          arch: target.arch,
          installPolicy: 'core',
        });
      }
    }
  });

  it('validates bundled artifacts use HTTPS URLs and non-placeholder SHA-256 digests', () => {
    const loaded = loadBundledToolchainManifest();
    for (const artifact of Object.values(loaded.artifacts)) {
      expect(artifact.url).toMatch(/^https:\/\//);
      expect(artifact.url).toMatch(new RegExp(`^https://github\\.com/sero-labs/sero/releases/download/${generatedArtifacts.releaseTag}/`));
      expect(artifact.url).not.toContain('downloads.sero.ai');
      expect(artifact.url).toMatch(/\.tar\.gz$/);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(new Set(artifact.sha256).size).toBeGreaterThan(6);
      expect(artifact.unpackTo).not.toContain('..');
      expect(Object.keys(artifact.binPaths)).toContain(artifact.tool);
      expect(artifact.minVersion).toBeTruthy();
    }
  });

  it('validates a complete test manifest', () => {
    expect(createTestToolchainManifest(manifest())).toEqual(manifest());
  });

  it('finds artifacts for a specific platform and architecture', () => {
    const loaded = validateToolchainManifest(manifest({
      artifacts: {
        'node-darwin-arm64': artifact(),
        'node-linux-x64': artifact({ platform: 'linux', arch: 'x64', unpackTo: 'node-linux' }),
      },
    }));

    expect(findArtifactForPlatform(loaded, 'node', 'linux', 'x64')).toMatchObject({
      platform: 'linux',
      arch: 'x64',
      unpackTo: 'node-linux',
    });
    expect(findArtifactForPlatform(loaded, 'pnpm', 'linux', 'x64')).toBeNull();
  });

  it('rejects unknown tools, unsupported platforms, and unsupported policies', () => {
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), tool: 'python' } },
    })).toThrow(/unknown tool/);
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), platform: 'freebsd' } },
    })).toThrow(/unsupported platform/);
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), installPolicy: 'global' } },
    })).toThrow(/unsupported install policy/);
  });

  it('rejects unpinned or unsafe artifact locations', () => {
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), url: 'http://downloads.example.test/node.tar.gz' } },
    })).toThrow(/URL must use https/);
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), sha256: 'abc' } },
    })).toThrow(/invalid sha256/);
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), unpackTo: '../node' } },
    })).toThrow(/invalid unpackTo/);
  });

  it('rejects unsafe manifest versions', () => {
    expect(() => validateToolchainManifest(manifest({ version: '../2026.05.16' }))).toThrow(
      /Invalid toolchain manifest version/,
    );
  });
});
