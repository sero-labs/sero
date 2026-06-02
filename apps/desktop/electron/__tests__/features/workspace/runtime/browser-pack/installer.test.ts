import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const testEnv = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-browser-pack-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
  };
});

vi.mock('@electron/platform/env', () => testEnv);

import { SERO_FIXED_ROOT } from '@electron/platform/env';
import { createBrowserRuntimeAdapter, firstExistingCandidate } from '@electron/features/workspace/runtime/browser-pack/adapter';
import { BrowserPackInstaller } from '@electron/features/workspace/runtime/browser-pack/installer';
import {
  browserPackDownloadPath,
  browserPackInstallRoot,
  browserPackInstalledMarker,
  browserPackManifestPath,
  browserPackStagingRoot,
  browserPackTempRoot,
} from '@electron/features/workspace/runtime/browser-pack/storage';
import type { BrowserPackManifest } from '@electron/features/workspace/runtime/browser-pack/types';
import type { DownloadArtifactOptions } from '@electron/features/workspace/runtime/toolchains/download';
import { cleanupToolchainVersion, toolchainStagingRoot, toolchainVersionRoot } from '@electron/features/workspace/runtime/toolchains/storage';

const reason = { kind: 'test' as const, detail: 'browser pack test' };
const cleanupVersions: string[] = [];

describe('BrowserPackInstaller', () => {
  afterEach(async () => {
    await Promise.all(cleanupVersions.map((version) => cleanupToolchainVersion(version)));
    await fs.promises.rm(path.join(SERO_FIXED_ROOT, 'browser-pack-test-archives'), { recursive: true, force: true });
    cleanupVersions.length = 0;
  });

  it('reports known unavailable artifacts as missing and non-installable', async () => {
    const manifest = createPendingManifest();
    const installer = new BrowserPackInstaller({ manifest, platform: 'linux', arch: 'arm64' });

    await expect(installer.status()).resolves.toMatchObject({
      state: 'missing',
      manifestVersion: manifest.version,
      artifactKey: 'browser-linux-arm64',
      error: { code: 'BROWSER_PACK_UNAVAILABLE', retryable: false, installable: false },
    });
    await expect(installer.ensure(reason)).rejects.toMatchObject({
      code: 'BROWSER_PACK_UNAVAILABLE',
      retryable: false,
      installable: false,
    });
  });

  it('reports unsupported platform or architecture as failed and non-installable', async () => {
    const harness = await createHarness();
    const installer = new BrowserPackInstaller({ manifest: harness.manifest, platform: 'freebsd', arch: 'x64' });

    await expect(installer.status()).resolves.toMatchObject({
      state: 'failed',
      error: { code: 'BROWSER_PACK_UNSUPPORTED', retryable: false, installable: false },
    });
  });

  it('reports missing/installable before install and activates the real artifact root shape', async () => {
    const harness = await createHarness();
    const installer = installerWithArchive(harness);

    await expect(installer.status()).resolves.toMatchObject({ state: 'installable', artifactKey: 'browser-darwin-arm64' });
    await expect(installer.ensure(reason)).resolves.toMatchObject({ state: 'ready', browsersPath: browserPackInstallRoot(harness.manifest.version) });
    await assertInstalledArtifactShape(harness);
  });

  it('creates adapter candidates that resolve to activated fixture paths from manifest metadata', async () => {
    const harness = await createHarness();
    const installer = installerWithArchive(harness);

    await installer.ensure(reason);

    const artifact = harness.manifest.artifacts['browser-darwin-arm64'];
    const adapter = createBrowserRuntimeAdapter({ manifest: harness.manifest, platform: 'darwin', arch: 'arm64' });
    const installRoot = browserPackInstallRoot(harness.manifest.version);
    expect(adapter.browsersPath).toBe(installRoot);
    expect(adapter.chromiumExecutableCandidates).toEqual(artifact.chromiumExecutableCandidates.map((candidate) => path.join(installRoot, candidate)));
    expect(adapter.ffmpegCandidates).toEqual(artifact.ffmpegCandidates.map((candidate) => path.join(installRoot, candidate)));
    expect(adapter.agentBrowserCandidates).toEqual(artifact.agentBrowserCandidates.map((candidate) => path.join(installRoot, candidate)));
    await expect(firstExistingCandidate(adapter.chromiumExecutableCandidates)).resolves.toBe(adapter.chromiumExecutableCandidates[0]);
    await expect(firstExistingCandidate(adapter.ffmpegCandidates)).resolves.toBe(adapter.ffmpegCandidates[0]);
    await expect(firstExistingCandidate(adapter.agentBrowserCandidates)).resolves.toBe(adapter.agentBrowserCandidates[0]);
  });

  it('dedupes installing calls and reports progress bytes', async () => {
    const harness = await createHarness();
    const events: string[] = [];
    let downloads = 0;
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async (options) => {
        downloads += 1;
        options.onProgress?.({ bytesReceived: 12, bytesTotal: 24 });
        await new Promise((resolve) => setTimeout(resolve, 10));
        await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
      },
    });
    installer.subscribe((event) => events.push(`${event.phase}:${event.bytesReceived ?? ''}`));

    const [first, second] = await Promise.all([installer.ensure(reason), installer.ensure(reason)]);

    expect(first.state).toBe('ready');
    expect(second.state).toBe('ready');
    expect(downloads).toBe(1);
    expect(events).toContain('downloading:12');
  });

  it('reports stale marker installs as failed when executables are missing', async () => {
    const harness = await createHarness();
    const installRoot = browserPackInstallRoot(harness.manifest.version);
    await fs.promises.mkdir(installRoot, { recursive: true });
    await fs.promises.writeFile(browserPackInstalledMarker(harness.manifest.version), 'stale\n');
    await fs.promises.writeFile(browserPackManifestPath(harness.manifest.version), `${JSON.stringify(harness.manifest)}\n`);
    const installer = new BrowserPackInstaller({ manifest: harness.manifest, platform: 'darwin', arch: 'arm64' });

    await expect(installer.status()).resolves.toMatchObject({
      state: 'failed',
      error: {
        code: 'BROWSER_PACK_INSTALL_FAILED',
        retryable: true,
        installable: true,
        details: { remediationAction: 'browserPack.reinstall', containerFallback: true },
      },
    });
  });

  it('reports marker installs as failed when the installed manifest is missing or stale', async () => {
    const harness = await createHarness();
    const installRoot = browserPackInstallRoot(harness.manifest.version);
    await fs.promises.cp(harness.archiveRoot, installRoot, { recursive: true });
    await fs.promises.writeFile(browserPackInstalledMarker(harness.manifest.version), 'stale\n');
    const installer = new BrowserPackInstaller({ manifest: harness.manifest, platform: 'darwin', arch: 'arm64' });

    await expect(installer.status()).resolves.toMatchObject({
      state: 'failed',
      error: { code: 'BROWSER_PACK_INSTALL_FAILED', retryable: true, installable: true },
    });

    await fs.promises.writeFile(browserPackManifestPath(harness.manifest.version), `${JSON.stringify({ ...harness.manifest, version: 'old' })}\n`);
    await expect(installer.status()).resolves.toMatchObject({
      state: 'failed',
      error: { code: 'BROWSER_PACK_INSTALL_FAILED', retryable: true, installable: true },
    });
  });

  it('validates staged executables before writing installed markers', async () => {
    const harness = await createHarness();
    const brokenArchive = path.join(SERO_FIXED_ROOT, 'browser-pack-test-archives', `${harness.manifest.version}-broken`);
    await writeExecutable(path.join(brokenArchive, 'agent-browser/bin/agent-browser'), 'agent-browser');
    await writeExecutable(path.join(brokenArchive, 'ffmpeg/ffmpeg-mac-arm64'), 'ffmpeg');
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async (options) => {
        await fs.promises.cp(brokenArchive, options.destination, { recursive: true });
      },
    });

    await expect(installer.ensure(reason)).rejects.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED', retryable: true });
    await expectExists(browserPackInstalledMarker(harness.manifest.version), false);
    await expectExists(browserPackManifestPath(harness.manifest.version), false);
    await expectExists(browserPackInstallRoot(harness.manifest.version), false);
    await expectExists(browserPackStagingRoot(harness.manifest.version), false);
  });

  it('cleans partial installs and returns failed status after digest mismatch', async () => {
    const harness = await createHarness();
    await fs.promises.mkdir(browserPackInstallRoot(harness.manifest.version), { recursive: true });
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async () => {
        throw new Error('SHA-256 mismatch: expected pinned digest');
      },
    });

    await expect(installer.ensure(reason)).rejects.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED', retryable: true });
    await expectExists(browserPackInstallRoot(harness.manifest.version), false);
    await expectExists(browserPackStagingRoot(harness.manifest.version), false);
    await expect(installer.status()).resolves.toMatchObject({ state: 'failed', error: { code: 'BROWSER_PACK_INSTALL_FAILED' } });
  });

  it('retries after a failed partial install', async () => {
    const harness = await createHarness();
    let attempts = 0;
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async (options) => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary outage');
        await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
      },
    });

    await expect(installer.ensure(reason)).rejects.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED' });
    await expect(installer.ensure(reason)).resolves.toMatchObject({ state: 'ready' });
    expect(attempts).toBe(2);
  });

  it('cleans browser-pack paths without wiping unrelated toolchain staging', async () => {
    const harness = await createHarness();
    const siblingStagingFile = path.join(toolchainStagingRoot(harness.manifest.version), 'node', 'state.txt');
    await fs.promises.mkdir(path.dirname(siblingStagingFile), { recursive: true });
    await fs.promises.writeFile(siblingStagingFile, 'keep me');
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async (options) => {
        await fs.promises.mkdir(path.dirname(options.destination), { recursive: true });
        await fs.promises.writeFile(options.destination, 'partial archive');
        await fs.promises.mkdir(browserPackTempRoot(harness.manifest.version), { recursive: true });
        await fs.promises.writeFile(path.join(browserPackTempRoot(harness.manifest.version), 'scratch'), 'temp');
        throw new Error('download failed');
      },
    });

    await expect(installer.ensure(reason)).rejects.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED' });
    await expectExists(browserPackDownloadPath(harness.manifest.version, 'browser-darwin-arm64'), false);
    await expectExists(browserPackTempRoot(harness.manifest.version), false);
    await expectExists(browserPackStagingRoot(harness.manifest.version), false);
    await expectExists(siblingStagingFile, true);
  });

  it('uninstalls an installed browser pack and removes staging, download, and temp roots', async () => {
    const harness = await createHarness();
    const installer = installerWithArchive(harness);

    await installer.ensure(reason);
    await fs.promises.mkdir(browserPackStagingRoot(harness.manifest.version), { recursive: true });
    await fs.promises.mkdir(browserPackDownloadPath(harness.manifest.version, 'browser-darwin-arm64'), { recursive: true });
    await fs.promises.mkdir(browserPackTempRoot(harness.manifest.version), { recursive: true });
    await expect(installer.uninstall()).resolves.toMatchObject({ state: 'installable' });
    await expectExists(browserPackInstalledMarker(harness.manifest.version), false);
    await expectExists(browserPackStagingRoot(harness.manifest.version), false);
    await expectExists(browserPackDownloadPath(harness.manifest.version, 'browser-darwin-arm64'), false);
    await expectExists(browserPackTempRoot(harness.manifest.version), false);
  });

  it('rejects uninstall while an install is in flight', async () => {
    const harness = await createHarness();
    let releaseDownload: () => void = () => undefined;
    let markDownloadStarted: () => void = () => undefined;
    const downloadStarted = new Promise<void>((resolve) => {
      markDownloadStarted = resolve;
    });
    const installer = new BrowserPackInstaller({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader: async () => {
        markDownloadStarted();
        await new Promise<void>((release) => {
          releaseDownload = release;
        });
        throw new Error('cancelled');
      },
    });

    const install = installer.ensure(reason).catch((error: unknown) => error);
    await downloadStarted;
    await expect(installer.uninstall()).rejects.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED' });
    releaseDownload();
    await expect(install).resolves.toMatchObject({ code: 'BROWSER_PACK_INSTALL_FAILED' });
  });
});

interface Harness {
  manifest: BrowserPackManifest;
  archiveRoot: string;
}

function createPendingManifest(): BrowserPackManifest {
  const version = `browser-pending-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  cleanupVersions.push(version);
  return {
    version,
    artifacts: {},
    artifactAvailability: {
      'browser-linux-arm64': {
        platform: 'linux',
        arch: 'arm64',
        slug: 'linux-arm64',
        status: 'pending',
        available: false,
      },
    },
  };
}

async function createHarness(): Promise<Harness> {
  const version = `browser-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  cleanupVersions.push(version);
  const archiveRoot = path.join(SERO_FIXED_ROOT, 'browser-pack-test-archives', version);
  await writeExecutable(path.join(archiveRoot, 'chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium'), 'Chromium');
  await writeExecutable(path.join(archiveRoot, 'ffmpeg/ffmpeg-mac-arm64'), 'ffmpeg');
  await writeExecutable(path.join(archiveRoot, 'agent-browser/bin/agent-browser'), 'agent-browser');
  return {
    archiveRoot,
    manifest: {
      version,
      artifacts: {
        'browser-darwin-arm64': {
          platform: 'darwin',
          arch: 'arm64',
          url: 'https://downloads.example.test/browser.tgz',
          sha256: sha256Text('browser'),
          unpackTo: 'browser',
          playwrightVersion: '1.52.0',
          chromiumRevision: '1169',
          ffmpegRevision: '1011',
          chromiumExecutableCandidates: ['chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium'],
          ffmpegCandidates: ['ffmpeg/ffmpeg-mac-arm64'],
          agentBrowserCandidates: ['agent-browser/bin/agent-browser'],
        },
      },
    },
  };
}

function installerWithArchive(harness: Harness): BrowserPackInstaller {
  return new BrowserPackInstaller({
    manifest: harness.manifest,
    platform: 'darwin',
    arch: 'arm64',
    downloader: async (options: DownloadArtifactOptions) => {
      options.onProgress?.({ bytesReceived: 10, bytesTotal: 10 });
      await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
    },
  });
}

async function assertInstalledArtifactShape(harness: Harness): Promise<void> {
  const installRoot = browserPackInstallRoot(harness.manifest.version);
  const artifact = harness.manifest.artifacts['browser-darwin-arm64'];
  await expect(fs.promises.access(browserPackInstalledMarker(harness.manifest.version))).resolves.toBeUndefined();
  await expect(fs.promises.access(browserPackManifestPath(harness.manifest.version))).resolves.toBeUndefined();
  await expectExists(path.join(installRoot, 'browser'), false);
  await expectExecutable(path.join(installRoot, artifact.chromiumExecutableCandidates[0]));
  await expectExecutable(path.join(installRoot, artifact.ffmpegCandidates[0]));
  await expectExecutable(path.join(installRoot, artifact.agentBrowserCandidates[0]));
}

async function writeExecutable(filePath: string, label: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `#!/bin/sh\necho ${label}\n`, { mode: 0o755 });
}

async function expectExecutable(filePath: string): Promise<void> {
  await expect(fs.promises.access(filePath, fs.constants.X_OK)).resolves.toBeUndefined();
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function expectExists(filePath: string, expected: boolean): Promise<void> {
  const exists = await fs.promises.access(filePath).then(() => true, () => false);
  expect(exists).toBe(expected);
}
