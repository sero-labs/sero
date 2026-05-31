import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mergeToolchainMetadata } from '../../../../scripts/toolchains/merge-toolchain-metadata.mjs';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-toolchain-merge-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('merge-toolchain-metadata', () => {
  it('merges release sidecars into committed toolchain metadata', async () => {
    const metadataPath = path.join(tempRoot, 'generated-artifacts.json');
    const sidecarDir = path.join(tempRoot, 'sidecars');
    const out = path.join(tempRoot, 'out.json');
    await fs.mkdir(sidecarDir, { recursive: true });
    await writeJson(metadataPath, { version: 'old', releaseTag: 'old-tag', artifacts: baseArtifacts() });
    await writeJson(path.join(sidecarDir, 'node-linux-x64.json'), {
      key: 'node-linux-x64',
      tool: 'node',
      platform: 'linux',
      arch: 'x64',
      slug: 'node-linux-x64',
      url: 'https://github.com/sero-labs/sero/releases/download/toolchains-test/node-linux-x64.tar.gz',
      sha256: 'a'.repeat(64),
    });

    await mergeToolchainMetadata({
      sidecarDir,
      metadataPath,
      out,
      releaseTag: 'toolchains-test',
      version: 'test-version',
    });

    const merged = JSON.parse(await fs.readFile(out, 'utf8'));
    expect(merged.version).toBe('test-version');
    expect(merged.releaseTag).toBe('toolchains-test');
    expect(merged.artifacts['node-linux-x64']).toMatchObject({ status: 'built', available: true, sha256: 'a'.repeat(64) });
    expect(merged.artifacts['npm-linux-x64']).toMatchObject({ status: 'pending', available: false });
  });
});

function baseArtifacts() {
  return {
    'node-linux-x64': artifact('node'),
    'npm-linux-x64': artifact('npm'),
  };
}

function artifact(tool: string) {
  return {
    tool,
    platform: 'linux',
    arch: 'x64',
    slug: `${tool}-linux-x64`,
    status: 'pending',
    available: false,
    unpackTo: `${tool}-linux-x64`,
    binPaths: { [tool]: `bin/${tool}` },
    minVersion: '1.0.0',
    installPolicy: 'core',
  };
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
