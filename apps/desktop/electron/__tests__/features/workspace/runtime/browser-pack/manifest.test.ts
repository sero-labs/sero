import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import generatedArtifacts from '@electron/features/workspace/runtime/browser-pack/generated-artifacts.json';
import { HOST_RELEASE_TARGETS } from '@electron/features/workspace/runtime/host-support-matrix';
import {
  createBrowserPackManifest,
  findBrowserArtifact,
  findBrowserArtifactAvailability,
  getBrowserPackManifest,
} from '@electron/features/workspace/runtime/browser-pack/manifest';
import { BROWSER_PACK_VERSION } from '../../../../../../scripts/browser-pack/browser-pack-config.mjs';

type GeneratedArtifact = (typeof generatedArtifacts.artifacts)[keyof typeof generatedArtifacts.artifacts];
type BuiltGeneratedArtifact = GeneratedArtifact & {
  status: 'built';
  available: true;
  url: string;
  sha256: string;
  sizeBytes: number;
};

describe('browser pack manifest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds runtime entries only from available generated metadata', () => {
    const manifest = getBrowserPackManifest();

    expect(manifest.version).toBe(generatedArtifacts.version);
    for (const [key, generated] of Object.entries(generatedArtifacts.artifacts)) {
      if (!isBuiltGeneratedArtifact(generated)) {
        expect(manifest.artifacts[key]).toBeUndefined();
        continue;
      }

      expect(manifest.artifacts[key]).toMatchObject({
        platform: generated.platform,
        arch: generated.arch,
        url: generated.url,
        sha256: generated.sha256,
        unpackTo: 'browser',
        playwrightVersion: generatedArtifacts.pins.playwrightVersion,
        chromiumRevision: generatedArtifacts.pins.chromiumRevision,
        ffmpegRevision: generatedArtifacts.pins.ffmpegRevision,
        chromiumExecutableCandidates: generated.chromiumExecutableCandidates,
        ffmpegCandidates: generated.ffmpegCandidates,
        agentBrowserCandidates: generated.agentBrowserCandidates,
      });
    }
  });

  it('contains the known browser-pack artifact matrix in generated metadata', () => {
    expect(Object.keys(generatedArtifacts.artifacts).sort()).toEqual([
      'browser-darwin-arm64',
      'browser-linux-arm64',
      'browser-linux-x64',
      'browser-win32-arm64',
      'browser-win32-x64',
    ]);
  });

  it('marks pending artifacts unavailable in metadata without installable digests', () => {
    const pendingArtifacts = Object.values(generatedArtifacts.artifacts).filter((artifact) => artifact.status === 'pending');

    expect(pendingArtifacts).not.toHaveLength(0);
    for (const artifact of pendingArtifacts) {
      expect(artifact.available).toBe(false);
      expect(artifact).not.toHaveProperty('sha256');
      expect(artifact).not.toHaveProperty('sizeBytes');
      expect(artifact).not.toHaveProperty('url');
    }
  });

  it('keeps generated browser-pack metadata aligned with the host release matrix', () => {
    const requiredKeys = HOST_RELEASE_TARGETS
      .filter((target) => target.releaseSupported && target.browserPackRequired)
      .map((target) => `browser-${target.platform}-${target.arch}`)
      .sort();
    const unsupportedKeys = HOST_RELEASE_TARGETS
      .filter((target) => !target.releaseSupported || !target.browserPackRequired)
      .map((target) => `browser-${target.platform}-${target.arch}`)
      .sort();

    expect(Object.keys(generatedArtifacts.artifacts).sort()).toEqual([
      ...requiredKeys,
      ...unsupportedKeys.filter((key) => generatedArtifacts.artifacts[key as keyof typeof generatedArtifacts.artifacts]),
    ].sort());
    for (const key of requiredKeys) {
      const artifact = generatedArtifacts.artifacts[key as keyof typeof generatedArtifacts.artifacts];
      expect(artifact).toBeDefined();
      expect(['built', 'pending']).toContain(artifact.status);
    }
    for (const key of unsupportedKeys) {
      const artifact = generatedArtifacts.artifacts[key as keyof typeof generatedArtifacts.artifacts];
      if (artifact) expect(artifact.available).toBe(false);
    }
  });

  it('uses production download URLs, valid sha, and non-zero sizes for built artifacts by default', () => {
    const manifest = getBrowserPackManifest();
    const builtArtifacts = Object.values(generatedArtifacts.artifacts).filter(isBuiltGeneratedArtifact);

    expect(Object.values(manifest.artifacts)).toHaveLength(builtArtifacts.length);
    for (const artifact of Object.values(manifest.artifacts)) {
      expect(artifact.url.startsWith(`https://github.com/sero-labs/sero/releases/download/${BROWSER_PACK_VERSION}/`)).toBe(true);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    for (const artifact of builtArtifacts) {
      expect(artifact.available).toBe(true);
      expect(artifact.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('maps generated darwin, linux, and win32 artifact metadata without hardcoded platform tables', () => {
    const manifest = createBrowserPackManifest(fixtureMetadata, undefined);

    expect(manifest.artifacts.darwin).toMatchObject({
      platform: 'darwin',
      arch: 'arm64',
      url: 'https://downloads.example.test/mac-arm64.tar.gz',
      sha256: fixtureMetadata.artifacts.darwin.sha256,
      chromiumExecutableCandidates: ['generated/chromium-mac'],
      ffmpegCandidates: ['generated/ffmpeg-mac'],
      agentBrowserCandidates: ['generated/agent-browser'],
    });
    expect(manifest.artifacts.linux).toMatchObject({
      platform: 'linux',
      arch: 'x64',
      url: 'https://downloads.example.test/linux-x64.tar.gz',
      sha256: fixtureMetadata.artifacts.linux.sha256,
      chromiumExecutableCandidates: ['generated/chromium-linux'],
      ffmpegCandidates: ['generated/ffmpeg-linux'],
      agentBrowserCandidates: ['generated/agent-browser'],
    });
    expect(manifest.artifacts.windows).toMatchObject({
      platform: 'win32',
      arch: 'arm64',
      url: 'https://downloads.example.test/win-arm64.tar.gz',
      sha256: fixtureMetadata.artifacts.windows.sha256,
      chromiumExecutableCandidates: ['generated/chromium-win.exe'],
      ffmpegCandidates: ['generated/ffmpeg-win.exe'],
      agentBrowserCandidates: ['generated/agent-browser.cmd'],
    });
  });

  it('rewrites only built artifact URL bases when SERO_BROWSER_PACK_BASE_URL is set', () => {
    vi.stubEnv('SERO_BROWSER_PACK_BASE_URL', 'http://127.0.0.1:8787/browser-pack/2026-05-16/');

    const manifest = getBrowserPackManifest();

    for (const [key, generated] of Object.entries(generatedArtifacts.artifacts)) {
      if (!isBuiltGeneratedArtifact(generated)) {
        expect(manifest.artifacts[key]).toBeUndefined();
        continue;
      }

      expect(manifest.artifacts[key].url).toBe(`http://127.0.0.1:8787/browser-pack/2026-05-16/${generated.slug}.tar.gz`);
      expect(manifest.artifacts[key].sha256).toBe(generated.sha256);
    }
  });

  it('does not retain stale digest or browser revision constants in runtime sources', () => {
    const sourcePath = path.join(
      process.cwd(),
      'electron/features/workspace/runtime/browser-pack/manifest.ts',
    );
    const source = fs.readFileSync(sourcePath, 'utf8');

    const builderSourcePath = path.join(process.cwd(), 'scripts/browser-pack/build-browser-pack.mjs');
    const builderSource = fs.readFileSync(builderSourcePath, 'utf8');
    const runtimeAdapterSourcePath = path.join(process.cwd(), 'electron/features/container/tools/tools-browser-runtime-adapter.ts');
    const runtimeAdapterSource = fs.readFileSync(runtimeAdapterSourcePath, 'utf8');

    expect(source).not.toContain('PINNED_SHA256');
    expect(source).not.toContain('b4b8f2f06f6b14a21583b2a77c10bde19c587c21eb7f9d394fcb0bb6df4c58dd');
    expect(builderSource).not.toContain('legacySha256BySlug');
    expect(builderSource).not.toContain('b4b8f2f06f6b14a21583b2a77c10bde19c587c21eb7f9d394fcb0bb6df4c58dd');
    expect(runtimeAdapterSource).not.toContain('AGENT_BROWSER_CHROMIUM_REVISION');
    expect(runtimeAdapterSource).not.toContain("const chromiumRevision = '1200'");
  });

  it('keeps artifact lookup stable', () => {
    const manifest = createBrowserPackManifest(fixtureMetadata, undefined);

    expect(findBrowserArtifact(manifest, 'linux', 'x64')).toEqual({
      key: 'linux',
      artifact: manifest.artifacts.linux,
    });
    expect(findBrowserArtifact(manifest, 'freebsd', 'x64')).toBeNull();
  });

  it('distinguishes built, pending, and unsupported artifact availability', () => {
    const manifest = createBrowserPackManifest(fixtureMetadataWithPending, undefined);

    expect(findBrowserArtifactAvailability(manifest, 'darwin', 'arm64')).toMatchObject({
      state: 'built',
      key: 'darwin',
      artifact: manifest.artifacts.darwin,
    });
    expect(findBrowserArtifactAvailability(manifest, 'linux', 'arm64')).toMatchObject({
      state: 'missing',
      key: 'linux-pending',
      platform: 'linux',
      arch: 'arm64',
      slug: 'linux-arm64',
    });
    expect(findBrowserArtifactAvailability(manifest, 'freebsd', 'x64')).toEqual({
      state: 'unsupported',
      platform: 'freebsd',
      arch: 'x64',
    });
    expect(manifest.artifacts['linux-pending']).toBeUndefined();
  });
});

function isBuiltGeneratedArtifact(artifact: GeneratedArtifact): artifact is BuiltGeneratedArtifact {
  return artifact.status === 'built'
    && artifact.available === true
    && 'url' in artifact
    && 'sha256' in artifact
    && 'sizeBytes' in artifact;
}

const fixtureMetadata = {
  version: 'browser-pack-test',
  pins: {
    playwrightVersion: '1.57.0',
    chromiumRevision: '1200',
    ffmpegRevision: '1011',
  },
  artifacts: {
    darwin: {
      platform: 'darwin' as const,
      arch: 'arm64' as const,
      slug: 'mac-arm64',
      status: 'built' as const,
      available: true,
      url: 'https://downloads.example.test/mac-arm64.tar.gz',
      sha256: '1'.repeat(64),
      sizeBytes: 1,
      chromiumExecutableCandidates: ['generated/chromium-mac'],
      ffmpegCandidates: ['generated/ffmpeg-mac'],
      agentBrowserCandidates: ['generated/agent-browser'],
    },
    linux: {
      platform: 'linux' as const,
      arch: 'x64' as const,
      slug: 'linux-x64',
      status: 'built' as const,
      available: true,
      url: 'https://downloads.example.test/linux-x64.tar.gz',
      sha256: '2'.repeat(64),
      sizeBytes: 2,
      chromiumExecutableCandidates: ['generated/chromium-linux'],
      ffmpegCandidates: ['generated/ffmpeg-linux'],
      agentBrowserCandidates: ['generated/agent-browser'],
    },
    windows: {
      platform: 'win32' as const,
      arch: 'arm64' as const,
      slug: 'win-arm64',
      status: 'built' as const,
      available: true,
      url: 'https://downloads.example.test/win-arm64.tar.gz',
      sha256: '3'.repeat(64),
      sizeBytes: 3,
      chromiumExecutableCandidates: ['generated/chromium-win.exe'],
      ffmpegCandidates: ['generated/ffmpeg-win.exe'],
      agentBrowserCandidates: ['generated/agent-browser.cmd'],
    },
  },
};

const fixtureMetadataWithPending = {
  ...fixtureMetadata,
  artifacts: {
    darwin: fixtureMetadata.artifacts.darwin,
    'linux-pending': {
      platform: 'linux' as const,
      arch: 'arm64' as const,
      slug: 'linux-arm64',
      status: 'pending' as const,
      available: false,
      chromiumExecutableCandidates: ['generated/chromium-linux'],
      ffmpegCandidates: ['generated/ffmpeg-linux'],
      agentBrowserCandidates: ['generated/agent-browser'],
    },
  },
};
