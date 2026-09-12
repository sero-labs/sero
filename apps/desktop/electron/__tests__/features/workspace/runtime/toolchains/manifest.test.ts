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
      { platform: 'darwin', arch: 'arm64', tools: ['node', 'npm', 'pnpm'] },
      { platform: 'linux', arch: 'arm64', tools: coreTools },
      { platform: 'linux', arch: 'x64', tools: coreTools },
      { platform: 'win32', arch: 'x64', tools: coreTools },
    ] as const;

    // uv is on-demand (not core) and ships for darwin arm64/x64, linux arm64/x64, and Windows x64.
    const uvArtifactCount = Object.values(loaded.artifacts).filter((artifact) => artifact.tool === 'uv').length;
    expect(uvArtifactCount).toBe(5);
    // rtk is on-demand, managed-only, and ships for the same five targets.
    const rtkArtifactCount = Object.values(loaded.artifacts).filter((artifact) => artifact.tool === 'rtk').length;
    expect(rtkArtifactCount).toBe(5);
    expect(Object.keys(loaded.artifacts).length).toBe(
      targets.reduce((count, target) => count + target.tools.length, 0) + uvArtifactCount + rtkArtifactCount,
    );
    for (const target of targets) {
      for (const tool of target.tools) {
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
    const seroUrlPrefix = `https://github.com/sero-labs/sero/releases/download/${generatedArtifacts.releaseTag}/`;
    for (const artifact of Object.values(loaded.artifacts)) {
      expect(artifact.url).toMatch(/^https:\/\//);
      // uv and rtk install from pinned upstream release assets, except uv on
      // Windows where Sero republishes a tar.gz.
      if (artifact.tool === 'rtk') {
        expect(artifact.url).toMatch(/^https:\/\/github\.com\/rtk-ai\/rtk\/releases\/download\/v\d+\.\d+\.\d+\//);
      } else if (artifact.tool === 'uv' && artifact.platform !== 'win32') {
        expect(artifact.url).toMatch(/^https:\/\/github\.com\/astral-sh\/uv\/releases\/download\/\d+\.\d+\.\d+\//);
      } else {
        expect(artifact.url.startsWith(seroUrlPrefix)).toBe(true);
      }
      expect(artifact.url).not.toContain('downloads.sero.ai');
      // The Windows RTK release publishes a .zip; every other artifact is a .tar.gz.
      const expectedSuffix = artifact.tool === 'rtk' && artifact.platform === 'win32' ? /\.zip$/ : /\.tar\.gz$/;
      expect(artifact.url).toMatch(expectedSuffix);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(new Set(artifact.sha256).size).toBeGreaterThan(6);
      expect(artifact.unpackTo).not.toContain('..');
      expect(Object.keys(artifact.binPaths)).toContain(artifact.tool);
      for (const binPath of Object.values(artifact.binPaths)) {
        expect(binPath.startsWith(`${artifact.unpackTo}/`)).toBe(true);
      }
      expect(artifact.minVersion).toBeTruthy();
    }
  });

  it('pins rtk to one exact, managed-only version on every supported host', () => {
    const loaded = loadBundledToolchainManifest();
    const rtkArtifacts = Object.values(loaded.artifacts).filter((artifact) => artifact.tool === 'rtk');
    expect(rtkArtifacts).toHaveLength(5);

    const pins = new Set(rtkArtifacts.map((artifact) => artifact.version));
    expect(pins).toEqual(new Set(['0.49.0']));
    for (const artifact of rtkArtifacts) {
      expect(artifact.managedOnly).toBe(true);
      expect(artifact.minVersion).toBe(artifact.version);
      expect(artifact.installPolicy).toBe('on-demand');
      expect(artifact.url).toContain(`/v${artifact.version}/`);
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

  it('accepts an exact version and a managed-only policy flag', () => {
    const pinned = validateToolchainManifest(manifest({
      artifacts: { 'rtk-darwin-arm64': artifact({ tool: 'rtk', version: '0.49.0', managedOnly: true }) },
    }));
    expect(pinned.artifacts['rtk-darwin-arm64']).toMatchObject({ version: '0.49.0', managedOnly: true });
    expect(() => validateToolchainManifest({
      ...manifest(),
      artifacts: { bad: { ...artifact(), managedOnly: 'yes' } },
    })).toThrow(/Expected boolean at managedOnly/);
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
