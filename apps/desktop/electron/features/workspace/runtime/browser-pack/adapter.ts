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
  // Only the agent-browser shim goes on PATH. The pack ships Playwright's
  // ffmpeg, which is a VP9-only build: first on PATH it turns every WebM
  // recording into `ffmpeg write failed: Broken pipe`. Recording now resolves
  // ffmpeg from the system, where the precondition check can verify VP8.
  const pathPrefixes = uniquePaths(agentBrowserCandidates.map((candidate) => path.dirname(candidate)));
  // Chromium makes its singleton socket in a new folder under the temp folder.
  // A Unix socket path is limited to about 104 bytes, and the pack folder is
  // already longer than that on Linux, so Chromium exits at once there.
  // Outside Windows it keeps the system's short temp folder.
  const tempDir = options.tempRoot ?? (platform === 'win32' ? browserPackTempRoot(manifest.version) : os.tmpdir());
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
      TMPDIR: tempDir,
      TEMP: tempDir,
      TMP: tempDir,
    },
  };
}

export async function firstExistingCandidate(candidates: string[]): Promise<string | null> {
  const results = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    exists: await exists(candidate),
  })));
  return results.find((result) => result.exists)?.candidate ?? null;
}

export async function validateInstalledBrowserPack(root: string, artifact: BrowserPackArtifactSpec): Promise<void> {
  await requireExecutable(root, artifact.chromiumExecutableCandidates, 'Chromium');
  await requireExecutable(root, artifact.agentBrowserCandidates, 'agent-browser');
  if (artifact.ffmpegCandidates.length > 0) {
    const ffmpeg = await requireExecutable(root, artifact.ffmpegCandidates, 'ffmpeg');
    // agent-browser spawns `ffmpeg`, while Playwright ships platform-named binaries.
    // A hard link also repairs packs installed before this alias was required.
    const alias = path.join(path.dirname(ffmpeg), artifact.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (alias !== ffmpeg) {
      await fs.promises.link(ffmpeg, alias).catch((error: unknown) => {
        if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'EEXIST') throw error;
      });
    }
  }
}

export function defaultBrowserTempRoot(): string {
  return path.join(os.tmpdir(), 'sero-browser-pack');
}

async function requireExecutable(root: string, candidates: string[], label: string): Promise<string> {
  const absoluteCandidates = candidates.map((candidate) => path.join(root, candidate));
  const executable = await firstExistingCandidate(absoluteCandidates);
  if (executable) return executable;
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
