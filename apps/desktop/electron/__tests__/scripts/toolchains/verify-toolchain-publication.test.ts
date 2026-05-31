import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyToolchainPublication } from '../../../../scripts/toolchains/verify-toolchain-publication.mjs';

const targets = [
  { platform: 'darwin', arch: 'arm64', releaseSupported: true },
  { platform: 'darwin', arch: 'x64', releaseSupported: false },
  { platform: 'linux', arch: 'x64', releaseSupported: true },
  { platform: 'linux', arch: 'arm64', releaseSupported: true },
  { platform: 'win32', arch: 'x64', releaseSupported: true },
];
const coreTools = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'];
const releaseTag = 'toolchains-2026-05-16';

function shaFor(key: string): string {
  return createHash('sha256').update(Buffer.from(key)).digest('hex');
}

describe('verify-toolchain-publication', () => {
  it('fails when a release-supported core artifact is pending', async () => {
    const metadata = createMetadata();
    metadata.artifacts['node-linux-x64'] = pendingArtifact('node', 'linux', 'x64', 'node-linux-x64');

    await expect(verify(metadata)).rejects.toThrow('node-linux-x64 is required for release but is not built/available');
  });

  it('fails when a core artifact does not use the toolchain GitHub Release URL', async () => {
    const metadata = createMetadata();
    metadata.artifacts['node-linux-x64'].url = 'https://downloads.sero.ai/toolchains/2026-05-16/node-linux-x64.tar.gz';

    await expect(verify(metadata)).rejects.toThrow('node-linux-x64 must use the toolchains-2026-05-16 GitHub Release asset URL');
  });

  it('passes when release-supported core artifacts are published and hash verified', async () => {
    await expect(verify(createMetadata())).resolves.toMatchObject({
      verifiedKeys: expect.arrayContaining(['node-macos-arm64', 'bash-windows-x64']),
    });
  });
});

function verify(metadata: ReturnType<typeof createMetadata>) {
  return verifyToolchainPublication({
    targets,
    metadata,
    downloadArtifact: async (_url: string, key: string) => Buffer.from(key),
  });
}

function createMetadata() {
  const artifacts: Record<string, ReturnType<typeof builtArtifact> | ReturnType<typeof pendingArtifact>> = {};
  for (const target of targets) {
    for (const tool of coreTools) {
      const slug = `${tool}-${toolchainSlugFor(target.platform, target.arch)}`;
      artifacts[slug] = target.releaseSupported
        ? builtArtifact(tool, target.platform, target.arch, slug)
        : pendingArtifact(tool, target.platform, target.arch, slug);
    }
  }
  return { version: '2026.05.16', releaseTag, artifacts };
}

function builtArtifact(tool: string, platform: string, arch: string, slug: string) {
  return {
    tool,
    platform,
    arch,
    slug,
    status: 'built' as const,
    available: true,
    url: `https://github.com/sero-labs/sero/releases/download/${releaseTag}/${slug}.tar.gz`,
    sha256: shaFor(slug),
  };
}

function pendingArtifact(tool: string, platform: string, arch: string, slug: string) {
  return {
    tool,
    platform,
    arch,
    slug,
    status: 'pending' as const,
    available: false,
    url: undefined as string | undefined,
    sha256: undefined as string | undefined,
  };
}

function toolchainSlugFor(platform: string, arch: string): string {
  if (platform === 'darwin') return arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  throw new Error(`Unsupported target: ${platform}/${arch}`);
}
