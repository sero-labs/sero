import fs from 'fs';
import path from 'path';

import {
  INSTALLED_MARKER,
  STAGING_SUFFIX,
  downloadedArtifactPath,
  listToolchainVersions,
  toolchainStagingRoot,
  toolchainVersionRoot,
} from '../toolchains/storage';

export function browserPackInstallRoot(version: string): string {
  return path.join(toolchainVersionRoot(version), 'browser');
}

export function browserPackStagingRoot(version: string): string {
  return path.join(toolchainStagingRoot(version), 'browser');
}

export function browserPackVersionStagingRoot(version: string): string {
  return `${browserPackInstallRoot(version)}${STAGING_SUFFIX}`;
}

export function browserPackInstalledMarker(version: string): string {
  return path.join(browserPackInstallRoot(version), INSTALLED_MARKER);
}

export function browserPackManifestPath(version: string): string {
  return path.join(browserPackInstallRoot(version), 'browser-manifest.json');
}

export function browserPackDownloadPath(version: string, artifactKey: string): string {
  return downloadedArtifactPath(version, `browser-${artifactKey}`);
}

export function browserPackTempRoot(version: string): string {
  return path.join(browserPackInstallRoot(version), 'tmp');
}

export async function findPreviousBrowserPackVersion(currentVersion: string): Promise<string | undefined> {
  const currentParts = parseBrowserPackVersion(currentVersion);
  if (!currentParts) return undefined;

  const versions = (await listToolchainVersions())
    .map((version) => ({ version, parts: parseBrowserPackVersion(version) }))
    .filter((candidate): candidate is { version: string; parts: number[] } => (
      candidate.parts !== null && compareVersionParts(candidate.parts, currentParts) < 0
    ))
    .sort((left, right) => compareVersionParts(right.parts, left.parts));

  for (const candidate of versions) {
    if (await exists(browserPackInstalledMarker(candidate.version))) return candidate.version;
  }
  return undefined;
}

function parseBrowserPackVersion(version: string): number[] | null {
  const match = /^browser-pack-(\d{4})-(\d{2})-(\d{2})-r(\d+)-f(\d+)-mf(\d+)-agent-(\d+(?:\.\d+)*)$/.exec(version);
  if (!match) return null;
  return match.slice(1, 7).map(Number).concat(match[7].split('.').map(Number));
}

function compareVersionParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.promises.access(filePath).then(() => true, () => false);
}
