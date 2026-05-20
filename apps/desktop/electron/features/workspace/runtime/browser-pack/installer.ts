import fs from 'fs';
import path from 'path';

import { unpackArchive, type ArchiveUnpacker } from '../toolchains/archives';
import { downloadArtifact, type DownloadArtifactOptions } from '../toolchains/download';
import { toolchainVersionRoot } from '../toolchains/storage';
import { validateInstalledBrowserPack } from './adapter';
import { findBrowserArtifact, findBrowserArtifactAvailability, getBrowserPackManifest } from './manifest';
import {
  browserPackDownloadPath,
  browserPackInstallRoot,
  browserPackInstalledMarker,
  browserPackManifestPath,
  browserPackStagingRoot,
  browserPackTempRoot,
} from './storage';
import type {
  BrowserPackArtifactSpec,
  BrowserPackError,
  BrowserPackInstallReason,
  BrowserPackManifest,
  BrowserPackProgressEvent,
  BrowserPackProgressListener,
  BrowserPackStatus,
} from './types';

export interface BrowserPackInstallerOptions {
  manifest?: BrowserPackManifest;
  platform?: NodeJS.Platform;
  arch?: string;
  downloader?: (options: DownloadArtifactOptions) => Promise<void>;
  unpacker?: ArchiveUnpacker;
}

interface BrowserArtifactSelection {
  key: string;
  artifact: BrowserPackArtifactSpec;
  artifactUrl: string;
  sha256: string;
}

export class BrowserPackInstaller {
  private readonly manifest: BrowserPackManifest;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly downloader: (options: DownloadArtifactOptions) => Promise<void>;
  private readonly unpacker: ArchiveUnpacker;
  private readonly listeners = new Set<BrowserPackProgressListener>();
  private inFlight?: Promise<BrowserPackStatus>;
  private lastFailure?: BrowserPackError;

  constructor(options: BrowserPackInstallerOptions = {}) {
    this.manifest = options.manifest ?? getBrowserPackManifest();
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.downloader = options.downloader ?? downloadArtifact;
    this.unpacker = options.unpacker ?? unpackArchive;
  }

  subscribe(listener: BrowserPackProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async status(): Promise<BrowserPackStatus> {
    const availability = findBrowserArtifactAvailability(this.manifest, this.platform, this.arch);
    if (availability.state === 'missing') return this.unavailableStatus(availability.key);
    if (availability.state === 'unsupported') return this.unsupportedStatus();
    const selection = this.selection();
    if (!selection) return this.unsupportedStatus();
    if (this.inFlight) return { state: 'installing', manifestVersion: this.manifest.version, artifactKey: selection.key };
    if (await exists(browserPackInstalledMarker(this.manifest.version))) {
      try {
        await validateInstalledBrowserPackManifest(this.manifest.version, this.manifest, selection.key);
        await validateInstalledBrowserPack(browserPackInstallRoot(this.manifest.version), selection.artifact);
        return {
          state: 'ready',
          manifestVersion: this.manifest.version,
          artifactKey: selection.key,
          browsersPath: browserPackInstallRoot(this.manifest.version),
        };
      } catch (error) {
        return {
          state: 'failed',
          manifestVersion: this.manifest.version,
          artifactKey: selection.key,
          error: makeBrokenInstallError(error, this.manifest.version, selection.key),
        };
      }
    }
    if (this.lastFailure) return { state: 'failed', manifestVersion: this.manifest.version, artifactKey: selection.key, error: this.lastFailure };
    return {
      state: 'installable',
      manifestVersion: this.manifest.version,
      artifactKey: selection.key,
      error: makeError('BROWSER_PACK_REQUIRED', 'Host browser automation pack is not installed.', this.manifest.version, selection.key, true, true),
    };
  }

  ensure(reason: BrowserPackInstallReason): Promise<BrowserPackStatus> {
    if (this.inFlight) return this.inFlight;
    const operation = this.ensureInternal(reason).finally(() => {
      this.inFlight = undefined;
    });
    this.inFlight = operation;
    return operation;
  }

  async uninstall(): Promise<BrowserPackStatus> {
    if (this.inFlight) throw makeError('BROWSER_PACK_INSTALL_FAILED', 'Cannot uninstall Browser Pack while installation is in progress.', this.manifest.version, this.selection()?.key, true, true);
    const selection = this.selection();
    this.emit({ phase: 'uninstalling', artifactKey: selection?.key });
    await cleanup(this.manifest.version, selection?.key);
    this.lastFailure = undefined;
    return this.status();
  }

  private async ensureInternal(reason: BrowserPackInstallReason): Promise<BrowserPackStatus> {
    const current = await this.status();
    if (current.state === 'ready') return current;
    const availability = findBrowserArtifactAvailability(this.manifest, this.platform, this.arch);
    if (availability.state === 'missing') throw makeUnavailableError(this.manifest.version, availability.key);
    if (availability.state === 'unsupported') throw makeError('BROWSER_PACK_UNSUPPORTED', `Browser pack is not supported for ${this.platform}/${this.arch}.`, this.manifest.version, undefined, false, false);
    const selection = this.selection();
    if (!selection) throw makeError('BROWSER_PACK_UNSUPPORTED', `Browser pack is not supported for ${this.platform}/${this.arch}.`, this.manifest.version, undefined, false, false);

    this.lastFailure = undefined;
    this.emit({ phase: 'queued', artifactKey: selection.key, reason });
    await cleanup(this.manifest.version, selection.key);

    try {
      this.emit({ phase: 'downloading', artifactKey: selection.key, reason });
      const archivePath = browserPackDownloadPath(this.manifest.version, selection.key);
      await this.downloader({
        url: selection.artifactUrl,
        sha256: selection.sha256,
        destination: archivePath,
        onProgress: (progress) => this.emit({
          phase: 'downloading',
          artifactKey: selection.key,
          reason,
          bytesReceived: progress.bytesReceived,
          bytesTotal: progress.bytesTotal,
        }),
      });

      this.emit({ phase: 'verifying', artifactKey: selection.key, reason });
      this.emit({ phase: 'unpacking', artifactKey: selection.key, reason });
      await this.unpacker({ archivePath, destination: browserPackStagingRoot(this.manifest.version) });
      this.emit({ phase: 'activating', artifactKey: selection.key, reason });
      await this.activate(selection);
      const ready: BrowserPackStatus = {
        state: 'ready',
        manifestVersion: this.manifest.version,
        artifactKey: selection.key,
        browsersPath: browserPackInstallRoot(this.manifest.version),
      };
      this.emit({ phase: 'ready', artifactKey: selection.key, reason });
      return ready;
    } catch (error) {
      await cleanup(this.manifest.version, selection.key);
      const failure = toInstallError(error, this.manifest.version, selection.key);
      this.lastFailure = failure;
      this.emit({ phase: 'failed', artifactKey: selection.key, reason, error: failure });
      throw failure;
    }
  }

  private async activate(selection: BrowserArtifactSelection): Promise<void> {
    const finalPath = browserPackInstallRoot(this.manifest.version);
    const stagingPath = browserPackStagingRoot(this.manifest.version);
    await validateInstalledBrowserPack(stagingPath, selection.artifact);
    await fs.promises.mkdir(toolchainVersionRoot(this.manifest.version), { recursive: true });
    await fs.promises.rm(finalPath, { recursive: true, force: true });
    await fs.promises.rename(stagingPath, finalPath);
    await validateInstalledBrowserPack(finalPath, selection.artifact);
    await fs.promises.mkdir(path.dirname(browserPackManifestPath(this.manifest.version)), { recursive: true });
    await writeAtomic(browserPackManifestPath(this.manifest.version), `${JSON.stringify(this.manifest, null, 2)}\n`);
    await writeAtomic(browserPackInstalledMarker(this.manifest.version), `${new Date().toISOString()}\n`);
  }

  private selection(): BrowserArtifactSelection | null {
    const selection = findBrowserArtifact(this.manifest, this.platform, this.arch);
    return selection ? { key: selection.key, artifact: selection.artifact, artifactUrl: selection.artifact.url, sha256: selection.artifact.sha256 } : null;
  }

  private unavailableStatus(artifactKey: string): BrowserPackStatus {
    return {
      state: 'missing',
      manifestVersion: this.manifest.version,
      artifactKey,
      error: makeUnavailableError(this.manifest.version, artifactKey),
    };
  }

  private unsupportedStatus(): BrowserPackStatus {
    return {
      state: 'failed',
      manifestVersion: this.manifest.version,
      error: makeError('BROWSER_PACK_UNSUPPORTED', `Browser pack is not supported for ${this.platform}/${this.arch}.`, this.manifest.version, undefined, false, false),
    };
  }

  private emit(event: Omit<BrowserPackProgressEvent, 'manifestVersion'>): void {
    const payload: BrowserPackProgressEvent = { manifestVersion: this.manifest.version, ...event };
    for (const listener of this.listeners) listener(payload);
  }
}

export function createBrowserPackInstaller(options: BrowserPackInstallerOptions = {}): BrowserPackInstaller {
  return new BrowserPackInstaller(options);
}

async function cleanup(version: string, artifactKey?: string): Promise<void> {
  await fs.promises.rm(browserPackTempRoot(version), { recursive: true, force: true });
  await fs.promises.rm(browserPackInstallRoot(version), { recursive: true, force: true });
  await fs.promises.rm(browserPackStagingRoot(version), { recursive: true, force: true });
  if (artifactKey) await fs.promises.rm(browserPackDownloadPath(version, artifactKey), { recursive: true, force: true });
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.promises.writeFile(tempPath, contents);
  await fs.promises.rename(tempPath, filePath);
}

async function validateInstalledBrowserPackManifest(
  version: string,
  manifest: BrowserPackManifest,
  artifactKey: string,
): Promise<void> {
  const manifestPath = browserPackManifestPath(version);
  const parsed = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as BrowserPackManifest;
  if (parsed.version !== manifest.version) {
    throw new Error(`Browser Pack manifest version mismatch: expected ${manifest.version}, found ${parsed.version ?? 'unknown'}.`);
  }
  const expectedArtifact = manifest.artifacts[artifactKey];
  const installedArtifact = parsed.artifacts?.[artifactKey];
  if (!expectedArtifact || !installedArtifact) {
    throw new Error(`Browser Pack manifest is missing artifact ${artifactKey}.`);
  }
  if (JSON.stringify(installedArtifact) !== JSON.stringify(expectedArtifact)) {
    throw new Error(`Browser Pack manifest artifact ${artifactKey} does not match current metadata.`);
  }
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

function makeUnavailableError(manifestVersion: string, artifactKey: string): BrowserPackError {
  return makeError(
    'BROWSER_PACK_UNAVAILABLE',
    `Published host browser automation pack is not available for ${artifactKey} yet. Use Docker/Apple Container browser automation or run the local artifact smoke flow.`,
    manifestVersion,
    artifactKey,
    false,
    false,
  );
}

function makeBrokenInstallError(error: unknown, manifestVersion: string, artifactKey: string): BrowserPackError {
  const message = error instanceof Error ? error.message : 'Browser pack installed marker is stale.';
  return {
    ...makeError('BROWSER_PACK_INSTALL_FAILED', `Browser pack install is incomplete: ${message}`, manifestVersion, artifactKey, true, true),
    details: { remediationAction: 'browserPack.reinstall', containerFallback: true },
  };
}

function toInstallError(error: unknown, manifestVersion: string, artifactKey: string): BrowserPackError {
  if (isBrowserPackError(error)) return error;
  return makeError(
    'BROWSER_PACK_INSTALL_FAILED',
    error instanceof Error ? error.message : 'Browser pack installation failed.',
    manifestVersion,
    artifactKey,
    true,
    true,
  );
}

function makeError(
  code: BrowserPackError['code'],
  message: string,
  manifestVersion: string,
  artifactKey: string | undefined,
  retryable: boolean,
  installable: boolean,
): BrowserPackError {
  return { code, message, manifestVersion, artifactKey, retryable, installable };
}

function isBrowserPackError(error: unknown): error is BrowserPackError {
  return typeof error === 'object' && error !== null && 'code' in error && 'retryable' in error;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
