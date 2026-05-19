import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), 'scripts/browser-pack/merge-browser-pack-metadata.mjs');
const productionUrlBase = 'https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16';

let tempRoot: string;
let sidecarDir: string;
let outputPath: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-browser-pack-merge-'));
  sidecarDir = path.join(tempRoot, 'sidecars');
  outputPath = path.join(tempRoot, 'generated-artifacts.json');
  await fs.mkdir(sidecarDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('merge-browser-pack-metadata', () => {
  it('keeps missing sidecars pending while marking valid sidecars built', async () => {
    await writeSidecar({ slug: 'mac-arm64', sha256: 'a'.repeat(64), sizeBytes: 123456789 });

    await runMerge();

    const metadata = JSON.parse(await fs.readFile(outputPath, 'utf8')) as GeneratedMetadata;
    expect(metadata.version).toBe('browser-pack-2026-05-16');
    expect(Object.keys(metadata.artifacts)).toEqual([
      'browser-darwin-arm64',
      'browser-darwin-x64',
      'browser-linux-x64',
      'browser-linux-arm64',
      'browser-win32-x64',
      'browser-win32-arm64',
    ]);
    expect(metadata.artifacts['browser-darwin-arm64']).toMatchObject({
      status: 'built',
      available: true,
      url: `${productionUrlBase}/mac-arm64.tar.gz`,
      sha256: 'a'.repeat(64),
      sizeBytes: 123456789,
    });
    expect(metadata.artifacts['browser-linux-x64']).toMatchObject({
      platform: 'linux',
      arch: 'x64',
      slug: 'linux-x64',
      status: 'pending',
      available: false,
    });
    expect(metadata.artifacts['browser-linux-x64']).not.toHaveProperty('sha256');
    expect(metadata.artifacts['browser-linux-x64']).not.toHaveProperty('sizeBytes');
    expect(metadata.artifacts['browser-linux-x64']).not.toHaveProperty('url');
  });

  it('fails sidecars with invalid sha or size', async () => {
    await writeSidecar({ slug: 'linux-x64', sha256: 'not-a-sha', sizeBytes: 1 });
    await expect(runMerge()).rejects.toMatchObject({
      stderr: expect.stringContaining('browser-linux-x64 has invalid sha256'),
    });

    await fs.rm(path.join(sidecarDir, 'linux-x64.json'));
    await writeSidecar({ slug: 'linux-x64', sha256: 'b'.repeat(64), sizeBytes: 0 });
    await expect(runMerge()).rejects.toMatchObject({
      stderr: expect.stringContaining('browser-linux-x64 has invalid sizeBytes'),
    });
  });
});

async function runMerge() {
  return execFileAsync('node', [
    scriptPath,
    '--sidecar-dir',
    sidecarDir,
    '--out',
    outputPath,
    '--url-base',
    productionUrlBase,
  ], { cwd: process.cwd(), encoding: 'utf8' });
}

async function writeSidecar({ slug, sha256, sizeBytes }: { slug: string; sha256: string; sizeBytes: number }) {
  const target = sidecarTargets[slug];
  await fs.writeFile(path.join(sidecarDir, `${slug}.json`), `${JSON.stringify({
    key: target.key,
    platform: target.platform,
    arch: target.arch,
    slug,
    url: `${productionUrlBase}/${slug}.tar.gz`,
    sha256,
    sizeBytes,
    chromiumExecutableCandidates: ['unused/by/merge'],
    ffmpegCandidates: ['unused/by/merge'],
    agentBrowserCandidates: ['unused/by/merge'],
  }, null, 2)}\n`);
}

interface GeneratedMetadata {
  version: string;
  artifacts: Record<string, Record<string, unknown>>;
}

const sidecarTargets: Record<string, { key: string; platform: string; arch: string }> = {
  'mac-arm64': { key: 'browser-darwin-arm64', platform: 'darwin', arch: 'arm64' },
  'linux-x64': { key: 'browser-linux-x64', platform: 'linux', arch: 'x64' },
};
