import fs from 'fs';
import path from 'path';

import { SERO_FIXED_ROOT } from '@electron/platform/env';

export const TOOLCHAINS_DIR_NAME = 'toolchains';
export const INSTALLED_MARKER = '.installed';
export const STAGING_SUFFIX = '.staging';

export function toolchainsRoot(): string {
  return path.join(SERO_FIXED_ROOT, TOOLCHAINS_DIR_NAME);
}

export function assertValidToolchainVersion(version: string): void {
  if (!version || version === '.' || version === '..') {
    throw new Error(`Invalid toolchain manifest version: ${version}`);
  }
  if (version.includes('/') || version.includes('\\') || path.isAbsolute(version)) {
    throw new Error(`Invalid toolchain manifest version: ${version}`);
  }
}

export function toolchainVersionRoot(version: string): string {
  assertValidToolchainVersion(version);
  return path.join(toolchainsRoot(), version);
}

export function toolchainStagingRoot(version: string): string {
  return `${toolchainVersionRoot(version)}${STAGING_SUFFIX}`;
}

export function installedMarkerPath(version: string): string {
  return path.join(toolchainVersionRoot(version), INSTALLED_MARKER);
}

export function manifestPath(version: string): string {
  return path.join(toolchainVersionRoot(version), 'manifest.json');
}

export function downloadedArtifactPath(version: string, artifactKey: string): string {
  return safeJoin(toolchainStagingRoot(version), `downloads/${artifactKey}`);
}

export function artifactInstallPath(version: string, unpackTo: string): string {
  return safeJoin(toolchainVersionRoot(version), unpackTo);
}

export function artifactStagingPath(version: string, unpackTo: string): string {
  return safeJoin(toolchainStagingRoot(version), unpackTo);
}

export function managedBinPath(version: string, relativeBinPath: string): string {
  return safeJoin(toolchainVersionRoot(version), relativeBinPath);
}

export function selectToolchainGcCandidates(input: {
  versions: string[];
  currentVersion: string;
  previousVersion?: string;
}): string[] {
  const keep = new Set([input.currentVersion, input.previousVersion].filter(isDefined));
  return input.versions.filter((version) => !keep.has(version)).sort();
}

export async function listToolchainVersions(): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(toolchainsRoot(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.endsWith(STAGING_SUFFIX))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

export async function cleanupToolchainVersion(version: string): Promise<void> {
  await fs.promises.rm(toolchainVersionRoot(version), { recursive: true, force: true });
  await fs.promises.rm(toolchainStagingRoot(version), { recursive: true, force: true });
}

export async function cleanupArtifactInstall(version: string, unpackTo: string): Promise<void> {
  await fs.promises.rm(artifactInstallPath(version, unpackTo), { recursive: true, force: true });
  await fs.promises.rm(artifactStagingPath(version, unpackTo), { recursive: true, force: true });
}

export async function cleanupDownloadedArtifact(version: string, artifactKey: string): Promise<void> {
  const downloadPath = downloadedArtifactPath(version, artifactKey);
  const downloadsDir = path.dirname(downloadPath);
  const downloadName = path.basename(downloadPath);

  await fs.promises.rm(downloadPath, { recursive: true, force: true });
  if (await exists(downloadsDir)) {
    const entries = await fs.promises.readdir(downloadsDir);
    await Promise.all(entries
      .filter((entry) => entry.startsWith(`${downloadName}.tmp-`))
      .map((entry) => fs.promises.rm(path.join(downloadsDir, entry), { recursive: true, force: true })));
    await removeDirectoryIfEmpty(downloadsDir);
  }
  await removeDirectoryIfEmpty(toolchainStagingRoot(version));
}

function safeJoin(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid toolchain relative path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Toolchain path escapes fixed root: ${relativePath}`);
  }
  return resolvedPath;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function removeDirectoryIfEmpty(directory: string): Promise<void> {
  if (!(await exists(directory))) return;
  const entries = await fs.promises.readdir(directory);
  if (entries.length === 0) await fs.promises.rmdir(directory);
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

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
