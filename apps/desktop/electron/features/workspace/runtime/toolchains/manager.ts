import fs from 'fs';
import path from 'path';

import { unpackArchive, type ArchiveUnpacker } from './archives';
import { downloadArtifact, type DownloadArtifactOptions } from './download';
import { findArtifactForPlatform } from './manifest';
import { ToolchainProgressBus, type ToolchainProgressListener } from './progress';
import {
  artifactInstallPath,
  artifactStagingPath,
  cleanupArtifactInstall,
  cleanupToolchainVersion,
  downloadedArtifactPath,
  installedMarkerPath,
  listToolchainVersions,
  managedBinPath,
  manifestPath,
  selectToolchainGcCandidates,
  toolchainVersionRoot,
} from './storage';
import type {
  ArtifactSpec,
  ToolInstallReason,
  ToolName,
  ToolResolution,
  ToolStatus,
  ToolchainError,
  ToolchainManifest,
  ToolchainProgressEvent,
} from './types';
import { verifyTool, type ToolVerifierOptions } from './verifiers';
import { prependPathEntries } from './path-env';
import { systemToolCandidates } from './system-candidates';

export interface ToolchainManagerOptions {
  manifest: ToolchainManifest;
  platform?: NodeJS.Platform;
  arch?: string;
  systemResolver?: (tool: ToolName) => Promise<ToolStatus | null>;
  verifier?: (tool: ToolName, candidate: string, options: ToolVerifierOptions) => Promise<ToolStatus>;
  downloader?: (options: DownloadArtifactOptions) => Promise<void>;
  unpacker?: ArchiveUnpacker;
}

interface ArtifactSelection {
  key: string;
  artifact: ArtifactSpec;
}

export class ToolchainManager {
  private readonly manifest: ToolchainManifest;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly systemResolver: (tool: ToolName) => Promise<ToolStatus | null>;
  private readonly verifier: (tool: ToolName, candidate: string, options: ToolVerifierOptions) => Promise<ToolStatus>;
  private readonly downloader: (options: DownloadArtifactOptions) => Promise<void>;
  private readonly unpacker: ArchiveUnpacker;
  private readonly progress = new ToolchainProgressBus();
  private readonly inFlight = new Map<string, Promise<ToolResolution>>();
  private coreInFlight: Promise<ToolResolution[]> | null = null;

  constructor(options: ToolchainManagerOptions) {
    this.manifest = options.manifest;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.systemResolver = options.systemResolver ?? this.defaultSystemResolver;
    this.verifier = options.verifier ?? verifyTool;
    this.downloader = options.downloader ?? downloadArtifact;
    this.unpacker = options.unpacker ?? unpackArchive;
  }

  subscribe(listener: ToolchainProgressListener): () => void {
    return this.progress.subscribe(listener);
  }

  async resolve(tool: ToolName): Promise<ToolResolution | null> {
    const system = await this.systemResolver(tool);
    if (system?.state === 'ready') return system;
    return this.resolveInstalled(tool);
  }

  async status(tool: ToolName): Promise<ToolStatus> {
    const resolved = await this.resolve(tool);
    if (resolved) return { ...resolved, state: 'ready' };
    const artifact = this.findArtifact(tool);
    return {
      tool,
      state: 'missing',
      error: artifact
        ? makeError('TOOL_REQUIRED', `${tool} is not installed.`, tool, artifact.key, this.manifest.version, true, true)
        : makeError('TOOL_ARTIFACT_UNSUPPORTED', `${tool} is not available for this platform.`, tool, undefined, this.manifest.version, false, false),
    };
  }

  ensure(tool: ToolName, reason: ToolInstallReason): Promise<ToolResolution> {
    const artifact = this.findArtifact(tool);
    const key = `${this.manifest.version}:${artifact?.key ?? tool}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const operation = this.ensureInternal(tool, reason, artifact, true).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }

  ensureCore(reason: ToolInstallReason): Promise<ToolResolution[]> {
    if (this.coreInFlight) return this.coreInFlight;
    this.coreInFlight = this.ensureCoreInternal(reason).finally(() => {
      this.coreInFlight = null;
    });
    return this.coreInFlight;
  }

  async binDirs(): Promise<string[]> {
    if (!(await exists(installedMarkerPath(this.manifest.version)))) return [];
    const dirs = new Set<string>();
    for (const artifact of Object.values(this.manifest.artifacts)) {
      for (const relativePath of Object.values(artifact.binPaths)) {
        const binPath = managedBinPath(this.manifest.version, relativePath);
        if (await exists(binPath)) dirs.add(path.dirname(binPath));
      }
    }
    return [...dirs];
  }

  async collectGarbage(previousVersion?: string): Promise<string[]> {
    const versions = await listToolchainVersions();
    const candidates = selectToolchainGcCandidates({
      versions,
      currentVersion: this.manifest.version,
      previousVersion,
    });
    await Promise.all(candidates.map((version) => cleanupToolchainVersion(version)));
    return candidates;
  }

  private async ensureCoreInternal(reason: ToolInstallReason): Promise<ToolResolution[]> {
    const coreTools = uniqueTools(
      Object.values(this.manifest.artifacts).filter((artifact) => artifact.installPolicy === 'core'),
    );
    const installed: ToolResolution[] = [];
    const pending: Array<{ tool: ToolName; selection: ArtifactSelection | null }> = [];

    for (const tool of coreTools) {
      const resolved = await this.resolve(tool);
      if (resolved) {
        installed.push(resolved);
      } else {
        pending.push({ tool, selection: this.findArtifact(tool) });
      }
    }

    if (pending.length > 0) {
      await fs.promises.rm(installedMarkerPath(this.manifest.version), { force: true });
      for (const item of pending) {
        installed.push(await this.ensureInternal(item.tool, reason, item.selection, false));
      }
      await this.writeVersionReadyMarker();
    }

    const resolutions = await Promise.all(coreTools.map((tool) => this.resolve(tool)));
    if (resolutions.some((resolution) => !resolution)) {
      await fs.promises.rm(installedMarkerPath(this.manifest.version), { force: true });
      throw makeError('TOOL_INSTALL_FAILED', 'Core tool installation did not produce every required tool.', undefined, undefined, this.manifest.version, true, true);
    }
    return resolutions as ToolResolution[];
  }

  private async ensureInternal(
    tool: ToolName,
    reason: ToolInstallReason,
    selection: ArtifactSelection | null,
    writeReadyMarker: boolean,
  ): Promise<ToolResolution> {
    const resolved = await this.resolve(tool);
    if (resolved) return resolved;
    if (!selection) throw makeError('TOOL_ARTIFACT_UNSUPPORTED', `${tool} is not available for this platform.`, tool, undefined, this.manifest.version, false, false);
    if (selection.artifact.installPolicy === 'large-explicit' && reason.kind !== 'settings') {
      throw makeError('TOOL_REQUIRED', `${tool} requires explicit installation.`, tool, selection.key, this.manifest.version, false, true);
    }

    this.emit(selection, reason, 'queued');
    await fs.promises.rm(installedMarkerPath(this.manifest.version), { force: true });
    await cleanupArtifactInstall(this.manifest.version, selection.artifact.unpackTo);

    try {
      this.emit(selection, reason, 'downloading');
      const downloadPath = downloadedArtifactPath(this.manifest.version, selection.key);
      await this.downloader({
        url: selection.artifact.url,
        sha256: selection.artifact.sha256,
        destination: downloadPath,
        onProgress: (progress) => this.emit(selection, reason, 'downloading', {
          bytesReceived: progress.bytesReceived,
          bytesTotal: progress.bytesTotal,
        }),
      });

      this.emit(selection, reason, 'verifying');
      this.emit(selection, reason, 'unpacking');
      await this.unpacker({
        archivePath: downloadPath,
        destination: artifactStagingPath(this.manifest.version, selection.artifact.unpackTo),
      });

      this.emit(selection, reason, 'activating');
      await this.activate(selection, writeReadyMarker);
      const installed = await this.resolveInstalled(tool, writeReadyMarker);
      if (!installed) throw new Error(`${tool} did not resolve after activation.`);
      this.emit(selection, reason, 'ready');
      return installed;
    } catch (error) {
      await cleanupArtifactInstall(this.manifest.version, selection.artifact.unpackTo);
      await fs.promises.rm(installedMarkerPath(this.manifest.version), { force: true });
      const failure = toInstallError(error, tool, selection.key, this.manifest.version);
      this.emit(selection, reason, 'failed', { error: failure });
      throw failure;
    }
  }

  private async activate(selection: ArtifactSelection, writeReadyMarker: boolean): Promise<void> {
    const versionRoot = toolchainVersionRoot(this.manifest.version);
    const finalPath = artifactInstallPath(this.manifest.version, selection.artifact.unpackTo);
    const stagingPath = artifactStagingPath(this.manifest.version, selection.artifact.unpackTo);
    await fs.promises.mkdir(versionRoot, { recursive: true });
    await fs.promises.rm(finalPath, { recursive: true, force: true });
    await fs.promises.rename(stagingPath, finalPath);
    await fs.promises.writeFile(manifestPath(this.manifest.version), `${JSON.stringify(this.manifest, null, 2)}\n`);
    if (writeReadyMarker) await this.writeVersionReadyMarker();
  }

  private async writeVersionReadyMarker(): Promise<void> {
    await fs.promises.writeFile(installedMarkerPath(this.manifest.version), `${new Date().toISOString()}\n`);
  }

  private async resolveInstalled(tool: ToolName, requireReadyMarker = true): Promise<ToolResolution | null> {
    if (requireReadyMarker && !(await exists(installedMarkerPath(this.manifest.version)))) return null;
    const selection = this.findArtifact(tool);
    if (!selection) return null;
    const relativePath = selection.artifact.binPaths[tool] ?? Object.values(selection.artifact.binPaths)[0];
    if (!relativePath) return null;
    const candidate = managedBinPath(this.manifest.version, relativePath);
    if (!(await exists(candidate))) return null;
    const status = await this.verifier(tool, candidate, {
      source: 'managed',
      requiredVersion: selection.artifact.minVersion,
      env: await this.managedVerificationEnv(requireReadyMarker),
    });
    if (status.state !== 'ready') return null;
    return { tool, source: 'managed', path: candidate, version: status.version, binDir: path.dirname(candidate) };
  }

  private async managedVerificationEnv(requireReadyMarker: boolean): Promise<NodeJS.ProcessEnv> {
    return prependPathEntries(process.env, await this.installedBinDirs(requireReadyMarker), this.platform);
  }

  private async installedBinDirs(requireReadyMarker: boolean): Promise<string[]> {
    if (requireReadyMarker && !(await exists(installedMarkerPath(this.manifest.version)))) return [];
    const dirs = new Set<string>();
    for (const artifact of Object.values(this.manifest.artifacts)) {
      for (const relativePath of Object.values(artifact.binPaths)) {
        const binPath = managedBinPath(this.manifest.version, relativePath);
        if (await exists(binPath)) dirs.add(path.dirname(binPath));
      }
    }
    return [...dirs];
  }

  private findArtifact(tool: ToolName): ArtifactSelection | null {
    const artifact = findArtifactForPlatform(this.manifest, tool, this.platform, this.arch);
    if (!artifact) return null;
    const key = Object.entries(this.manifest.artifacts).find((entry) => entry[1] === artifact)?.[0];
    return { key: key ?? `${tool}-${this.platform}-${this.arch}`, artifact };
  }

  private emit(
    selection: ArtifactSelection,
    reason: ToolInstallReason,
    phase: ToolchainProgressEvent['phase'],
    overrides: Partial<Pick<ToolchainProgressEvent, 'bytesReceived' | 'bytesTotal' | 'error'>> = {},
  ): void {
    this.progress.emit({
      tool: selection.artifact.tool,
      artifactKey: selection.key,
      manifestVersion: this.manifest.version,
      phase,
      reason,
      ...overrides,
    });
  }

  private defaultSystemResolver = async (tool: ToolName): Promise<ToolStatus | null> => {
    if (shouldForceManagedTool(tool)) return null;
    const candidates = systemToolCandidates(tool, this.platform);
    let fallbackStatus: ToolStatus | null = null;

    for (const candidate of candidates) {
      const status = await this.verifier(tool, candidate, { source: 'system' });
      if (status.state === 'ready') return status;
      fallbackStatus ??= status;
    }

    return fallbackStatus;
  };
}

function shouldForceManagedTool(tool: ToolName): boolean {
  if (process.env.NODE_ENV !== 'test') return false;
  const tools = process.env.SERO_E2E_FORCE_MANAGED_TOOLS;
  if (!tools) return false;
  return tools.split(',').map((value) => value.trim()).includes(tool);
}

function uniqueTools(artifacts: ArtifactSpec[]): ToolName[] {
  return [...new Set(artifacts.map((artifact) => artifact.tool))];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function toInstallError(error: unknown, tool: ToolName, artifactKey: string, manifestVersion: string): ToolchainError {
  if (isToolchainError(error)) return error;
  return makeError(
    'TOOL_INSTALL_FAILED',
    error instanceof Error ? error.message : 'Tool installation failed.',
    tool,
    artifactKey,
    manifestVersion,
    true,
    true,
  );
}

function makeError(
  code: ToolchainError['code'],
  message: string,
  tool: ToolName | undefined,
  artifactKey: string | undefined,
  manifestVersion: string,
  retryable: boolean,
  installable: boolean,
): ToolchainError {
  return new ToolchainOperationError({ code, message, tool, artifactKey, manifestVersion, retryable, installable });
}

class ToolchainOperationError extends Error implements ToolchainError {
  readonly code: ToolchainError['code'];
  readonly tool?: ToolName;
  readonly artifactKey?: string;
  readonly manifestVersion?: string;
  readonly retryable: boolean;
  readonly installable?: boolean;
  readonly details?: Record<string, string | number | boolean | null>;

  constructor(error: ToolchainError) {
    super(`${error.code}: ${error.message}`);
    this.name = 'ToolchainOperationError';
    this.code = error.code;
    this.tool = error.tool;
    this.artifactKey = error.artifactKey;
    this.manifestVersion = error.manifestVersion;
    this.retryable = error.retryable;
    this.installable = error.installable;
    this.details = error.details;
  }
}

function isToolchainError(error: unknown): error is ToolchainError {
  return typeof error === 'object' && error !== null && 'code' in error && 'retryable' in error;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
