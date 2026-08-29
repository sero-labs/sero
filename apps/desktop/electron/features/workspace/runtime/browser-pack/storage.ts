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
  const versions = (await listToolchainVersions())
    .filter((version) => version !== currentVersion)
    .sort((left, right) => right.localeCompare(left));

  for (const version of versions) {
    if (await exists(browserPackInstalledMarker(version))) return version;
  }
  return undefined;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.promises.access(filePath).then(() => true, () => false);
}
