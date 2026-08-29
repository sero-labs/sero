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
    .filter((candidate): candidate is { version: string; parts: BrowserPackVersionParts } => (
      candidate.parts !== null && compareVersionParts(candidate.parts, currentParts) < 0
    ))
    .sort((left, right) => compareVersionParts(right.parts, left.parts));

  for (const candidate of versions) {
    if (await exists(browserPackInstalledMarker(candidate.version))) return candidate.version;
  }
  return undefined;
}

interface BrowserPackVersionParts {
  pack: number[];
  agent: AgentVersionParts;
}

interface AgentVersionParts {
  core: number[];
  prerelease: Array<number | string> | null;
}

function parseBrowserPackVersion(version: string): BrowserPackVersionParts | null {
  const match = /^browser-pack-(\d{4})-(\d{2})-(\d{2})-r(\d+)-f(\d+)-mf(\d+)-agent-(.+)$/.exec(version);
  if (!match) return null;
  const agent = parseAgentVersion(match[7]);
  return agent ? { pack: match.slice(1, 7).map(Number), agent } : null;
}

function parseAgentVersion(version: string): AgentVersionParts | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part) ?? null,
  };
}

function compareVersionParts(left: BrowserPackVersionParts, right: BrowserPackVersionParts): number {
  return compareNumberParts(left.pack, right.pack)
    || compareNumberParts(left.agent.core, right.agent.core)
    || comparePrereleaseParts(left.agent.prerelease, right.agent.prerelease);
}

function compareNumberParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function comparePrereleaseParts(left: Array<number | string> | null, right: Array<number | string> | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart - rightPart;
    if (typeof leftPart === 'number') return -1;
    if (typeof rightPart === 'number') return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.promises.access(filePath).then(() => true, () => false);
}
