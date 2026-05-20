import fs from 'fs';
import os from 'os';
import path from 'path';

import { findBrowserArtifact, getBrowserPackManifest } from './manifest';
import { browserPackInstallRoot, browserPackTempRoot } from './storage';
import type { BrowserPackArtifactSpec, BrowserPackManifest, BrowserRuntimeAdapter } from './types';

export interface BrowserRuntimeAdapterOptions {
  manifest?: BrowserPackManifest;
  platform?: NodeJS.Platform;
  arch?: string;
  tempRoot?: string;
}

export function createBrowserRuntimeAdapter(options: BrowserRuntimeAdapterOptions = {}): BrowserRuntimeAdapter {
  const manifest = options.manifest ?? getBrowserPackManifest();
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const selection = findBrowserArtifact(manifest, platform, arch);
  if (!selection) throw new Error(`Browser pack is not available for ${platform}/${arch}`);

  const browsersPath = browserPackInstallRoot(manifest.version);
  const chromiumExecutableCandidates = selection.artifact.chromiumExecutableCandidates.map((candidate) => path.join(browsersPath, candidate));
  const ffmpegCandidates = selection.artifact.ffmpegCandidates.map((candidate) => path.join(browsersPath, candidate));
  const agentBrowserCandidates = selection.artifact.agentBrowserCandidates.map((candidate) => path.join(browsersPath, candidate));
  const pathPrefixes = uniquePaths([
    ...agentBrowserCandidates.map((candidate) => path.dirname(candidate)),
    ...ffmpegCandidates.map((candidate) => path.dirname(candidate)),
  ]);
  const tempDir = options.tempRoot ?? browserPackTempRoot(manifest.version);
  return {
    browsersPath,
    chromiumExecutableCandidates,
    ffmpegCandidates,
    agentBrowserCandidates,
    pathPrefixes,
    tempDir,
    env: {
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      SERO_BROWSER_PACK_PATH: browsersPath,
      TMPDIR: platform === 'win32' ? tempDir : tempDir,
      TEMP: tempDir,
      TMP: tempDir,
    },
  };
}

export async function firstExistingCandidate(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function validateInstalledBrowserPack(root: string, artifact: BrowserPackArtifactSpec): Promise<void> {
  await requireExecutable(root, artifact.chromiumExecutableCandidates, 'Chromium');
  await requireExecutable(root, artifact.agentBrowserCandidates, 'agent-browser');
  if (artifact.ffmpegCandidates.length > 0) {
    await requireExecutable(root, artifact.ffmpegCandidates, 'ffmpeg');
  }
}

export function defaultBrowserTempRoot(): string {
  return path.join(os.tmpdir(), 'sero-browser-pack');
}

async function requireExecutable(root: string, candidates: string[], label: string): Promise<void> {
  const absoluteCandidates = candidates.map((candidate) => path.join(root, candidate));
  if (await firstExistingCandidate(absoluteCandidates)) return;
  throw new Error(`${label} executable is missing or is not executable in Browser Pack.`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch (error) {
    if (isNotFound(error) || isPermission(error)) return false;
    throw error;
  }
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isPermission(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EACCES';
}
