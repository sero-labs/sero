import path from 'path';

import {
  INSTALLED_MARKER,
  STAGING_SUFFIX,
  downloadedArtifactPath,
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
