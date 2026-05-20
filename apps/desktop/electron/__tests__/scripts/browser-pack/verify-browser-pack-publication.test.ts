import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { HOST_RELEASE_TARGETS } from '@electron/features/workspace/runtime/host-support-matrix';

import { verifyBrowserPackPublication } from '../../../../scripts/browser-pack/verify-browser-pack-publication.mjs';

const productionUrlBase = 'https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16';
const fixtureBytes = new TextEncoder().encode('published browser pack fixture');
const fixtureSha = createHash('sha256').update(fixtureBytes).digest('hex');

interface TestArtifact {
  platform: string;
  arch: string;
  slug: string;
  status: 'built' | 'pending';
  available: boolean;
  url?: string;
  sha256?: string;
  sizeBytes?: number;
}

interface TestMetadata {
  artifacts: Record<string, TestArtifact>;
}

describe('verify-browser-pack-publication', () => {
  it('fails when a release-supported browser pack is pending', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-linux-x64'] = createPendingArtifact('linux', 'x64', 'linux-x64');

    await expect(verify(metadata)).rejects.toThrow('browser-linux-x64 is required for release but is not built/available');
  });

  it('fails when a required artifact uses a non-GitHub production URL', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-linux-x64'].url = 'https://downloads.example.test/linux-x64.tar.gz';

    await expect(verify(metadata)).rejects.toThrow('browser-linux-x64 must use the browser-pack-2026-05-16 GitHub Release asset URL');
  });

  it('fails when a required artifact has an invalid sha256', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-linux-x64'].sha256 = 'not-a-sha';

    await expect(verify(metadata)).rejects.toThrow('browser-linux-x64 has invalid sha256');
  });

  it('fails when a required artifact has zero or missing size', async () => {
    const zeroSizeMetadata = createBuiltMetadata();
    zeroSizeMetadata.artifacts['browser-linux-x64'].sizeBytes = 0;
    await expect(verify(zeroSizeMetadata)).rejects.toThrow('browser-linux-x64 has invalid sizeBytes');

    const missingSizeMetadata = createBuiltMetadata();
    delete missingSizeMetadata.artifacts['browser-linux-x64'].sizeBytes;
    await expect(verify(missingSizeMetadata)).rejects.toThrow('browser-linux-x64 has invalid sizeBytes');
  });

  it('fails when a required artifact cannot be downloaded', async () => {
    const metadata = createBuiltMetadata();

    await expect(verifyBrowserPackPublication({
      targets: HOST_RELEASE_TARGETS,
      metadata,
      downloadArtifact: async () => {
        throw new Error('HTTP 404 Not Found');
      },
    })).rejects.toThrow(`browser-darwin-arm64 download failed from ${productionUrlBase}/mac-arm64.tar.gz: HTTP 404 Not Found`);
  });

  it('fails when a required artifact download hash mismatches metadata', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-linux-x64'].sha256 = '0'.repeat(64);

    await expect(verify(metadata)).rejects.toThrow('browser-linux-x64 sha256 mismatch');
  });

  it('passes when all release-supported required artifacts are published and hash verified', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-win32-arm64'] = createPendingArtifact('win32', 'arm64', 'win-arm64');

    metadata.artifacts['browser-darwin-x64'] = createPendingArtifact('darwin', 'x64', 'mac-x64');

    await expect(verify(metadata)).resolves.toEqual({
      verifiedKeys: [
        'browser-darwin-arm64',
        'browser-linux-x64',
        'browser-linux-arm64',
        'browser-win32-x64',
      ],
      warnings: [
        'browser-darwin-x64 is explicitly unsupported/future and remains pending',
        'browser-win32-arm64 is explicitly unsupported/future and remains pending',
      ],
    });
  });
});

function verify(metadata: TestMetadata) {
  return verifyBrowserPackPublication({
    targets: HOST_RELEASE_TARGETS,
    metadata,
    downloadArtifact: async () => fixtureBytes,
  });
}

function createBuiltMetadata(): TestMetadata {
  const artifacts: Record<string, TestArtifact> = {};
  for (const target of HOST_RELEASE_TARGETS) {
    const slug = slugFor(target.platform, target.arch);
    artifacts[`browser-${target.platform}-${target.arch}`] = createBuiltArtifact(target.platform, target.arch, slug);
  }
  return { artifacts };
}

function createBuiltArtifact(platform: string, arch: string, slug: string): TestArtifact {
  return {
    platform,
    arch,
    slug,
    status: 'built',
    available: true,
    url: `${productionUrlBase}/${slug}.tar.gz`,
    sha256: fixtureSha,
    sizeBytes: fixtureBytes.byteLength,
  };
}

function createPendingArtifact(platform: string, arch: string, slug: string): TestArtifact {
  return {
    platform,
    arch,
    slug,
    status: 'pending',
    available: false,
  };
}

function slugFor(platform: string, arch: string): string {
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (platform === 'win32') return arch === 'arm64' ? 'win-arm64' : 'win-x64';
  throw new Error(`Unsupported fixture target: ${platform}/${arch}`);
}
