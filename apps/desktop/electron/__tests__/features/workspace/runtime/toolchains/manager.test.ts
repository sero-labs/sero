import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testEnv = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-toolchains-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOME: root,
  };
});

vi.mock('@electron/platform/env', () => testEnv);

import { SERO_FIXED_ROOT } from '@electron/platform/env';
import type { DownloadArtifactOptions } from '@electron/features/workspace/runtime/toolchains/download';
import { ToolchainManager } from '@electron/features/workspace/runtime/toolchains/manager';
import {
  artifactInstallPath,
  artifactStagingPath,
  cleanupToolchainVersion,
  downloadedArtifactPath,
  installedMarkerPath,
  managedBinPath,
  toolchainStagingRoot,
  toolchainVersionRoot,
} from '@electron/features/workspace/runtime/toolchains/storage';
import type { ToolName, ToolStatus, ToolchainManifest } from '@electron/features/workspace/runtime/toolchains/types';
import type { ToolVerifierOptions } from '@electron/features/workspace/runtime/toolchains/verifiers';

const reason = { kind: 'test' as const, detail: 'manager test' };

interface TestHarness {
  version: string;
  archiveRoot: string;
  manifest: ToolchainManifest;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function createHarness(tool: ToolName = 'node'): Promise<TestHarness> {
  const version = `test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const archiveRoot = path.join(SERO_FIXED_ROOT, 'toolchains-test-archives', version);
  const binName = tool === 'node' ? 'node' : tool;
  await fs.promises.mkdir(path.join(archiveRoot, 'bin'), { recursive: true });
  await fs.promises.writeFile(path.join(archiveRoot, 'bin', binName), '#!/bin/sh\necho ok\n', { mode: 0o755 });
  return {
    version,
    archiveRoot,
    manifest: {
      version,
      artifacts: {
        [`${tool}-darwin-arm64`]: {
          tool,
          platform: 'darwin',
          arch: 'arm64',
          url: `https://downloads.example.test/${tool}.tgz`,
          sha256: sha256Text(tool),
          unpackTo: tool,
          binPaths: { [tool]: `${tool}/bin/${binName}` },
          minVersion: '1.0.0',
          installPolicy: tool === 'node' ? 'core' : 'on-demand',
        },
      },
    },
  };
}

async function createCoreHarness(tools: ToolName[]): Promise<TestHarness & { archiveRoots: Record<string, string> }> {
  const version = `test-core-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const archiveRoots: Record<string, string> = {};
  const artifacts: ToolchainManifest['artifacts'] = {};
  for (const tool of tools) {
    const archiveRoot = path.join(SERO_FIXED_ROOT, 'toolchains-test-archives', version, tool);
    archiveRoots[tool] = archiveRoot;
    await fs.promises.mkdir(path.join(archiveRoot, 'bin'), { recursive: true });
    await fs.promises.writeFile(path.join(archiveRoot, 'bin', tool), '#!/bin/sh\necho ok\n', { mode: 0o755 });
    artifacts[`${tool}-darwin-arm64`] = {
      tool,
      platform: 'darwin',
      arch: 'arm64',
      url: `https://downloads.example.test/${tool}.tgz`,
      sha256: sha256Text(tool),
      unpackTo: tool,
      binPaths: { [tool]: `${tool}/bin/${tool}` },
      minVersion: '1.0.0',
      installPolicy: 'core',
    };
  }
  return { version, archiveRoot: archiveRoots[tools[0]], archiveRoots, manifest: { version, artifacts } };
}

function missingSystem(tool: ToolName): ToolStatus {
  return { tool, state: 'missing', source: 'system' };
}

function incompatibleSystem(tool: ToolName): ToolStatus {
  return { tool, state: 'incompatible', source: 'system', path: tool, version: '0.1.0' };
}

function readySystem(tool: ToolName): ToolStatus {
  return { tool, state: 'ready', source: 'system', path: `/usr/bin/${tool}`, version: '99.0.0' };
}

function readyVerifier(tool: ToolName, candidate: string, _options: ToolVerifierOptions): Promise<ToolStatus> {
  return Promise.resolve({ tool, state: 'ready', source: 'managed', path: candidate, version: '1.2.3' });
}

describe('ToolchainManager', () => {
  const cleanupVersions: string[] = [];

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(cleanupVersions.map((version) => cleanupToolchainVersion(version)));
    await fs.promises.rm(path.join(SERO_FIXED_ROOT, 'toolchains-test-archives'), { recursive: true, force: true });
    cleanupVersions.length = 0;
  });

  it('prefers a compatible verified system tool without installing', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    const downloader = vi.fn<((options: DownloadArtifactOptions) => Promise<void>)>();
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => readySystem(tool),
      downloader,
      verifier: readyVerifier,
    });

    await expect(manager.ensure('node', reason)).resolves.toMatchObject({ source: 'system', path: '/usr/bin/node' });
    expect(downloader).not.toHaveBeenCalled();
  });

  it('can force managed tools in release smoke tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SERO_E2E_FORCE_MANAGED_TOOLS', 'node');
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    const downloader = vi.fn(async (options: DownloadArtifactOptions) => {
      await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
    });
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      downloader,
      verifier: readyVerifier,
    });

    await expect(manager.ensure('node', reason)).resolves.toMatchObject({ source: 'managed' });
    expect(downloader).toHaveBeenCalledOnce();
  });

  it('prefers the absolute Git Bash path on Windows even when bare bash is available', async () => {
    vi.stubEnv('ProgramFiles', 'C:\\Program Files');
    const harness = await createHarness('bash');
    cleanupVersions.push(harness.version);
    const downloader = vi.fn<((options: DownloadArtifactOptions) => Promise<void>)>();
    const verifier = vi.fn(async (tool: ToolName, candidate: string): Promise<ToolStatus> => {
      if (candidate === 'bash' || candidate === 'C:\\Program Files\\Git\\bin\\bash.exe') {
        return { tool, state: 'ready', source: 'system', path: candidate, version: '5.2.0' };
      }
      return { tool, state: 'missing', source: 'system', path: candidate };
    });
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'win32',
      arch: 'x64',
      downloader,
      verifier,
    });

    await expect(manager.ensure('bash', reason)).resolves.toMatchObject({
      source: 'system',
      path: 'C:\\Program Files\\Git\\bin\\bash.exe',
    });
    expect(verifier).not.toHaveBeenCalledWith('bash', 'bash', { source: 'system' });
    expect(downloader).not.toHaveBeenCalled();
  });

  it('installs on first use when the system tool is incompatible', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    const events: string[] = [];
    const manager = managerWithArchive(harness, async (tool) => incompatibleSystem(tool));
    manager.subscribe((event) => events.push(event.phase));

    await expect(manager.ensure('node', reason)).resolves.toMatchObject({
      source: 'managed',
      path: managedBinPath(harness.version, 'node/bin/node'),
      binDir: path.dirname(managedBinPath(harness.version, 'node/bin/node')),
    });

    await expect(fs.promises.access(installedMarkerPath(harness.version))).resolves.toBeUndefined();
    expect(events).toEqual(expect.arrayContaining(['queued', 'downloading', 'verifying', 'unpacking', 'activating', 'ready']));
  });

  it('installs only the requested core tool for runtime command execution', async () => {
    const harness = await createCoreHarness(['git', 'bash']);
    cleanupVersions.push(harness.version);
    const downloads: string[] = [];
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async (options) => {
        downloads.push(path.basename(options.url));
        await fs.promises.cp(harness.archiveRoots.git, options.destination, { recursive: true });
      },
      verifier: readyVerifier,
    });

    await expect(manager.ensure('git', reason)).resolves.toMatchObject({ tool: 'git', source: 'managed' });
    expect(downloads).toEqual(['git.tgz']);
    await expectExists(artifactInstallPath(harness.version, 'git'), true);
    await expectExists(artifactInstallPath(harness.version, 'bash'), false);
  });

  it('installs a missing on-demand tool and reports progress bytes', async () => {
    const harness = await createHarness('rg');
    cleanupVersions.push(harness.version);
    const progressBytes: number[] = [];
    const manager = managerWithArchive(harness, async (tool) => missingSystem(tool));
    manager.subscribe((event) => {
      if (event.bytesReceived !== undefined) progressBytes.push(event.bytesReceived);
    });

    await expect(manager.ensure('rg', reason)).resolves.toMatchObject({ tool: 'rg', source: 'managed' });
    expect(progressBytes).toEqual([10]);
    await expectExists(toolchainStagingRoot(harness.version), false);
  });

  it('does not activate managed artifacts without .installed', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    await fs.promises.mkdir(path.dirname(managedBinPath(harness.version, 'node/bin/node')), { recursive: true });
    await fs.promises.writeFile(managedBinPath(harness.version, 'node/bin/node'), 'partial');
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async () => null,
      verifier: readyVerifier,
    });

    await expect(manager.resolve('node')).resolves.toBeNull();
  });

  it('cleans staging and final partials after digest mismatch', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    const staleDownload = downloadedArtifactPath(harness.version, 'node-darwin-arm64');
    await fs.promises.mkdir(artifactInstallPath(harness.version, 'node'), { recursive: true });
    await fs.promises.mkdir(path.dirname(staleDownload), { recursive: true });
    await fs.promises.writeFile(`${staleDownload}.tmp-stale`, 'partial');
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async () => {
        throw new Error('SHA-256 mismatch: expected pinned digest');
      },
      verifier: readyVerifier,
    });
    const events: string[] = [];
    manager.subscribe((event) => events.push(`${event.phase}:${event.error?.code ?? ''}`));

    await expect(manager.ensure('node', reason)).rejects.toMatchObject({ code: 'TOOL_INSTALL_FAILED', retryable: true });
    await expectExists(artifactInstallPath(harness.version, 'node'), false);
    await expectExists(artifactStagingPath(harness.version, 'node'), false);
    await expectExists(toolchainStagingRoot(harness.version), false);
    await expectExists(installedMarkerPath(harness.version), false);
    expect(events).toContain('failed:TOOL_INSTALL_FAILED');
  });

  it('surfaces offline failures as retryable install failures', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async () => {
        throw new Error('getaddrinfo ENOTFOUND downloads.example.test');
      },
      verifier: readyVerifier,
    });

    const failure = manager.ensure('node', reason);
    await expect(failure).rejects.toBeInstanceOf(Error);
    await expect(failure).rejects.toMatchObject({
      code: 'TOOL_INSTALL_FAILED',
      message: expect.stringContaining('ENOTFOUND'),
      retryable: true,
    });
  });

  it('retries after a failed partial install', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    let attempts = 0;
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async (options) => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary outage');
        await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
      },
      verifier: readyVerifier,
    });

    await expect(manager.ensure('node', reason)).rejects.toMatchObject({ code: 'TOOL_INSTALL_FAILED' });
    await expect(manager.ensure('node', reason)).resolves.toMatchObject({ source: 'managed' });
    expect(attempts).toBe(2);
  });

  it('dedupes concurrent ensure calls for the same artifact', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version);
    let downloads = 0;
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async (options) => {
        downloads += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
      },
      verifier: readyVerifier,
    });

    const [first, second] = await Promise.all([manager.ensure('node', reason), manager.ensure('node', reason)]);
    expect(first.path).toBe(second.path);
    expect(downloads).toBe(1);
  });

  it('does not write the shared core marker until every core tool installs', async () => {
    const harness = await createCoreHarness(['node', 'npm']);
    cleanupVersions.push(harness.version);
    const manager = new ToolchainManager({
      manifest: harness.manifest,
      platform: 'darwin',
      arch: 'arm64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async (options) => {
        if (options.url.endsWith('/npm.tgz')) throw new Error('npm download failed');
        await fs.promises.cp(harness.archiveRoots.node, options.destination, { recursive: true });
      },
      verifier: readyVerifier,
    });

    await expect(manager.ensureCore(reason)).rejects.toMatchObject({ code: 'TOOL_INSTALL_FAILED' });
    await expectExists(artifactInstallPath(harness.version, 'node'), true);
    await expectExists(artifactInstallPath(harness.version, 'npm'), false);
    await expectExists(installedMarkerPath(harness.version), false);
  });

  it('verifies managed Windows package shims with installed managed bins on PATH', async () => {
    const version = `test-windows-core-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cleanupVersions.push(version);
    const archiveRoot = path.join(SERO_FIXED_ROOT, 'toolchains-test-archives', version);
    await fs.promises.mkdir(path.join(archiveRoot, 'node', 'bin'), { recursive: true });
    await fs.promises.mkdir(path.join(archiveRoot, 'npm', 'bin'), { recursive: true });
    await fs.promises.writeFile(path.join(archiveRoot, 'node', 'bin', 'node.exe'), 'node');
    await fs.promises.writeFile(path.join(archiveRoot, 'npm', 'bin', 'npm.cmd'), 'npm');
    const manifest: ToolchainManifest = {
      version,
      artifacts: {
        'node-windows-x64': {
          tool: 'node',
          platform: 'win32',
          arch: 'x64',
          url: 'https://downloads.example.test/node.tgz',
          sha256: sha256Text('node'),
          unpackTo: 'node',
          binPaths: { node: 'node/bin/node.exe' },
          minVersion: '1.0.0',
          installPolicy: 'core',
        },
        'npm-windows-x64': {
          tool: 'npm',
          platform: 'win32',
          arch: 'x64',
          url: 'https://downloads.example.test/npm.tgz',
          sha256: sha256Text('npm'),
          unpackTo: 'npm',
          binPaths: { npm: 'npm/bin/npm.cmd' },
          minVersion: '1.0.0',
          installPolicy: 'core',
        },
      },
    };
    const nodeBinDir = path.dirname(managedBinPath(version, 'node/bin/node.exe'));
    const npmBinDir = path.dirname(managedBinPath(version, 'npm/bin/npm.cmd'));
    const verifier = vi.fn(async (tool: ToolName, candidate: string, options: ToolVerifierOptions): Promise<ToolStatus> => {
      if (tool === 'npm') {
        expect(options.env?.Path ?? options.env?.PATH).toContain(nodeBinDir);
        expect(options.env?.Path ?? options.env?.PATH).toContain(npmBinDir);
      }
      return { tool, state: 'ready', source: 'managed', path: candidate, version: '1.2.3' };
    });
    const manager = new ToolchainManager({
      manifest,
      platform: 'win32',
      arch: 'x64',
      systemResolver: async (tool) => missingSystem(tool),
      downloader: async (options) => {
        const tool = path.basename(options.url, '.tgz');
        await fs.promises.cp(path.join(archiveRoot, tool), options.destination, { recursive: true });
      },
      verifier,
    });

    await expect(manager.ensureCore(reason)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: 'node', source: 'managed' }),
      expect.objectContaining({ tool: 'npm', source: 'managed' }),
    ]));
    expect(verifier).toHaveBeenCalledWith('npm', managedBinPath(version, 'npm/bin/npm.cmd'), expect.objectContaining({
      env: expect.any(Object),
    }));
  });

  it('garbage collects all but current and previous toolchain versions', async () => {
    const harness = await createHarness();
    cleanupVersions.push(harness.version, 'old-a', 'old-b', 'previous');
    await Promise.all(cleanupVersions.map((version) => fs.promises.mkdir(toolchainVersionRoot(version), { recursive: true })));
    const manager = managerWithArchive(harness, async (tool) => missingSystem(tool));

    await expect(manager.collectGarbage('previous')).resolves.toEqual(expect.arrayContaining(['old-a', 'old-b']));
    await expectExists(toolchainVersionRoot('old-a'), false);
    await expectExists(toolchainVersionRoot('old-b'), false);
    await expectExists(toolchainVersionRoot('previous'), true);
    await expectExists(toolchainVersionRoot(harness.version), true);
  });
});

function managerWithArchive(
  harness: TestHarness,
  systemResolver: (tool: ToolName) => Promise<ToolStatus | null>,
): ToolchainManager {
  return new ToolchainManager({
    manifest: harness.manifest,
    platform: 'darwin',
    arch: 'arm64',
    systemResolver,
    downloader: async (options) => {
      options.onProgress?.({ bytesReceived: 10, bytesTotal: 10 });
      await fs.promises.cp(harness.archiveRoot, options.destination, { recursive: true });
    },
    verifier: readyVerifier,
  });
}

async function expectExists(filePath: string, expected: boolean): Promise<void> {
  await expect(fs.promises.access(filePath).then(() => true).catch(() => false)).resolves.toBe(expected);
}
