import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyHostModeRelease } from '../../../scripts/verify-host-mode-release.mjs';

interface FixtureTarget {
  platform: 'darwin' | 'linux' | 'win32';
  arch: 'arm64' | 'x64';
  releaseSupported: boolean;
  browserPackRequired: boolean;
}

interface FixtureArtifact {
  platform: string;
  arch: string;
  slug: string;
  status: 'built' | 'pending';
  available: boolean;
  url?: string;
  sha256?: string;
  sizeBytes?: number;
}

let tempRoot: string;
let repoRoot: string;
let desktopRoot: string;

const matrix: readonly FixtureTarget[] = [
  { platform: 'darwin', arch: 'arm64', releaseSupported: true, browserPackRequired: true },
  { platform: 'darwin', arch: 'x64', releaseSupported: false, browserPackRequired: false },
  { platform: 'linux', arch: 'x64', releaseSupported: true, browserPackRequired: true },
  { platform: 'linux', arch: 'arm64', releaseSupported: true, browserPackRequired: true },
  { platform: 'win32', arch: 'x64', releaseSupported: true, browserPackRequired: true },
  { platform: 'win32', arch: 'arm64', releaseSupported: false, browserPackRequired: false },
];

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-host-release-'));
  repoRoot = tempRoot;
  desktopRoot = path.join(repoRoot, 'apps/desktop');
  await writeFixture();
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('verify-host-mode-release', () => {
  it('fails when a required browser-pack artifact is not built and available', async () => {
    const metadata = createBuiltMetadata();
    metadata.artifacts['browser-linux-x64'] = createPendingArtifact('linux', 'x64', 'linux-x64');
    await writeJson(metadataPath(), metadata);

    await expect(verifyFixture()).rejects.toThrow('Missing built/available browser-pack artifact in committed metadata: browser-linux-x64');
  });

  it('fails when a required package script is missing', async () => {
    await writeJson(path.join(desktopRoot, 'package.json'), {
      scripts: {
        'dist:mac': 'bash scripts/build-release.sh --target mac',
        'dist:linux:x64': 'bash scripts/build-release.sh --target linux --arch x64',
        'dist:linux:arm64': 'bash scripts/build-release.sh --target linux --arch arm64',
        'dist:win': 'bash scripts/build-release.sh --target win',
        'browser-pack:verify-published': 'node scripts/browser-pack/verify-browser-pack-publication.mjs',
      },
    });

    await expect(verifyFixture()).rejects.toThrow('apps/desktop/package.json: Missing package script: dist:linux');
  });

  it('fails when the release workflow is missing a required operating system entry', async () => {
    await fs.writeFile(workflowPath(), workflowText().replace('          - target: linux-x64\n            os: linux\n            arch: x64\n            runner: ubuntu-24.04\n            dist: dist:linux:x64\n', ''));

    await expect(verifyFixture()).rejects.toThrow('.github/workflows/host-mode-release.yml: missing Linux x64 release job/matrix entry');
  });

  it('fails when the release workflow points at obsolete self-hosted runner labels', async () => {
    await fs.writeFile(workflowPath(), workflowText().replace('runner: ubuntu-24.04-arm', 'runner: [self-hosted, sero-linux, ARM64]'));

    await expect(verifyFixture()).rejects.toThrow('.github/workflows/host-mode-release.yml: missing Linux arm64 hosted runner: ubuntu-24.04-arm');
  });

  it('fails on stale docs that require local browser-pack overrides for supported platforms', async () => {
    await fs.writeFile(
      path.join(repoRoot, 'docs/features/host-toolchain.md'),
      'Linux, Windows, and Intel macOS require the local artifact smoke flow\n',
    );

    await expect(verifyFixture()).rejects.toThrow(
      'docs/features/host-toolchain.md: stale supported-platform browser-pack wording: "Linux, Windows, and Intel macOS require the local artifact smoke flow"',
    );
  });

  it('passes with a complete repository fixture', async () => {
    await expect(verifyFixture()).resolves.toMatchObject({
      requiredArtifactKeys: [
        'browser-darwin-arm64',
        'browser-linux-x64',
        'browser-linux-arm64',
        'browser-win32-x64',
      ],
    });
  });
});

function verifyFixture() {
  return verifyHostModeRelease({ repoRoot, desktopRoot });
}

async function writeFixture() {
  await fs.mkdir(path.dirname(matrixPath()), { recursive: true });
  await fs.mkdir(path.dirname(metadataPath()), { recursive: true });
  await fs.mkdir(path.dirname(workflowPath()), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'docs/features'), { recursive: true });
  await writeJson(matrixPath(), matrix);
  await writeJson(metadataPath(), createBuiltMetadata());
  await writeJson(path.join(desktopRoot, 'package.json'), {
    scripts: {
      'dist:mac': 'bash scripts/build-release.sh --target mac',
      'dist:linux': 'bash scripts/build-release.sh --target linux',
      'dist:linux:x64': 'bash scripts/build-release.sh --target linux --arch x64',
      'dist:linux:arm64': 'bash scripts/build-release.sh --target linux --arch arm64',
      'dist:win': 'bash scripts/build-release.sh --target win',
      'browser-pack:verify-published': 'node scripts/browser-pack/verify-browser-pack-publication.mjs',
    },
  });
  await fs.writeFile(workflowPath(), workflowText());
  await fs.writeFile(path.join(repoRoot, 'docs/features/host-toolchain.md'), 'Published browser packs use GitHub Release assets.\n');
}

function createBuiltMetadata() {
  const artifacts: Record<string, FixtureArtifact> = {};
  for (const target of matrix) {
    const slug = slugFor(target.platform, target.arch);
    artifacts[`browser-${target.platform}-${target.arch}`] = target.releaseSupported
      ? createBuiltArtifact(target.platform, target.arch, slug)
      : createPendingArtifact(target.platform, target.arch, slug);
  }
  return { artifacts };
}

function createBuiltArtifact(platform: string, arch: string, slug: string): FixtureArtifact {
  return {
    platform,
    arch,
    slug,
    status: 'built',
    available: true,
    url: `https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16/${slug}.tar.gz`,
    sha256: 'a'.repeat(64),
    sizeBytes: 123456789,
  };
}

function createPendingArtifact(platform: string, arch: string, slug: string): FixtureArtifact {
  return { platform, arch, slug, status: 'pending', available: false };
}

function workflowText() {
  return `name: Host Mode Release Gate
jobs:
  host-release:
    strategy:
      matrix:
        include:
          - target: macos-arm64
            os: macos
            arch: arm64
            runner: macos-15
            dist: dist:mac
          - target: linux-x64
            os: linux
            arch: x64
            runner: ubuntu-24.04
            dist: dist:linux:x64
          - target: linux-arm64
            os: linux
            arch: arm64
            runner: ubuntu-24.04-arm
            dist: dist:linux:arm64
          - target: windows-x64
            os: windows
            arch: x64
            runner: windows-latest
            dist: dist:win
    steps:
      - run: pnpm --filter @sero/desktop browser-pack:verify-published
      - run: pnpm --filter @sero/desktop e2e:workflow -- runtime-host-release.workflow.spec.ts
`;
}

function slugFor(platform: string, arch: string): string {
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (platform === 'win32') return arch === 'arm64' ? 'win-arm64' : 'win-x64';
  throw new Error(`Unsupported fixture target: ${platform}/${arch}`);
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function matrixPath() {
  return path.join(desktopRoot, 'electron/features/workspace/runtime/host-support-matrix.json');
}

function metadataPath() {
  return path.join(desktopRoot, 'electron/features/workspace/runtime/browser-pack/generated-artifacts.json');
}

function workflowPath() {
  return path.join(repoRoot, '.github/workflows/host-mode-release.yml');
}
