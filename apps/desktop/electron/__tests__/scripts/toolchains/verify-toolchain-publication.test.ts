import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

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
  return createHash('sha256').update(artifactBytes(key)).digest('hex');
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

  it('fails when a published archive contains an unsafe absolute symlink', async () => {
    const metadata = createMetadata();
    metadata.artifacts['npm-linux-x64'].sha256 = createHash('sha256').update(unsafeSymlinkTarGz()).digest('hex');

    await expect(verifyToolchainPublication({
      targets,
      metadata,
      downloadArtifact: async (_url: string, key: string) => (
        key === 'npm-linux-x64' ? unsafeSymlinkTarGz() : artifactBytes(key)
      ),
    })).rejects.toThrow('npm-linux-x64 archive is unsafe: unsafe symlink target /tmp/build/npm-cli.js');
  });

  it('fails when a published npm archive has a dereferenced broken wrapper', async () => {
    const metadata = createMetadata();
    metadata.artifacts['npm-linux-x64'].sha256 = createHash('sha256').update(brokenNpmWrapperTarGz()).digest('hex');

    await expect(verifyToolchainPublication({
      targets,
      metadata,
      downloadArtifact: async (_url: string, key: string) => (
        key === 'npm-linux-x64' ? brokenNpmWrapperTarGz() : artifactBytes(key)
      ),
    })).rejects.toThrow('npm-linux-x64 archive is unsafe: bin/npm does not point to lib/node_modules/npm/bin/npm-cli.js');
  });
});

function verify(metadata: ReturnType<typeof createMetadata>) {
  return verifyToolchainPublication({
    targets,
    metadata,
    downloadArtifact: async (_url: string, key: string) => artifactBytes(key),
  });
}

function artifactBytes(key: string): Buffer {
  if (!key.startsWith('npm-')) return tarGz([]);
  const entries: TarEntry[] = [
    npmWrapper('bin/npm', 'npm-cli.js'),
    npmWrapper('bin/npx', 'npx-cli.js'),
  ];
  if (key.includes('windows')) {
    entries.push(
      npmCmdWrapper('bin/npm.cmd', 'NPM_CLI_JS', 'npm-cli.js'),
      npmCmdWrapper('bin/npx.cmd', 'NPX_CLI_JS', 'npx-cli.js'),
    );
  }
  return tarGz(entries);
}

function unsafeSymlinkTarGz(): Buffer {
  return tarGz([{ name: 'bin/npm', type: '2', linkName: '/tmp/build/npm-cli.js' }]);
}

function brokenNpmWrapperTarGz(): Buffer {
  return tarGz([
    { name: 'bin/npm', data: "#!/usr/bin/env node\nrequire('../lib/cli.js')(process)\n", mode: 0o755 },
    npmWrapper('bin/npx', 'npx-cli.js'),
  ]);
}

function npmWrapper(name: string, cli: string): TarEntry {
  return {
    name,
    data: `#!/usr/bin/env node\nrequire('../lib/node_modules/npm/bin/${cli}')\n`,
    mode: 0o755,
  };
}

function npmCmdWrapper(name: string, variable: string, cli: string): TarEntry {
  return {
    name,
    data: `@ECHO OFF\nSETLOCAL\nSET "NODE_EXE=node"\nSET "${variable}=%~dp0..\\lib\\node_modules\\npm\\bin\\${cli}"\n"%NODE_EXE%" "%${variable}%" %*\n`,
    mode: 0o755,
  };
}

interface TarEntry {
  name: string;
  data?: string;
  mode?: number;
  type?: '0' | '2';
  linkName?: string;
}

function tarGz(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) chunks.push(tarHeader(entry), tarData(entry.data ?? ''));
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

function tarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512);
  const data = Buffer.from(entry.data ?? '');
  header.write(entry.name);
  writeOctal(header, entry.mode ?? 0o644, 100, 8);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  writeOctal(header, data.length, 124, 12);
  header.write('00000000000\0', 136);
  header.fill(' ', 148, 156);
  header.write(entry.type ?? '0', 156);
  if (entry.linkName) header.write(entry.linkName, 157);
  header.write('ustar\0', 257);
  header.write('00', 263);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
  header.write(`${checksum}\0 `, 148);
  return header;
}

function tarData(value: string): Buffer {
  const data = Buffer.from(value);
  const padding = Buffer.alloc(Math.ceil(data.length / 512) * 512 - data.length);
  return Buffer.concat([data, padding]);
}

function writeOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  buffer.write(value.toString(8).padStart(length - 2, '0') + '\0', offset);
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
