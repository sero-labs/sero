import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  assertRtkImagePinMatchesManifest,
  parseDockerfileBuildArgs,
  rtkImageVersion,
} from '@electron/features/workspace/runtime/toolchains/image-pin';
import { loadBundledToolchainManifest } from '@electron/features/workspace/runtime/toolchains/manifest';
import type { ToolchainManifest } from '@electron/features/workspace/runtime/toolchains/types';

const dockerfilePath = path.resolve(__dirname, '../../../../../../images/Dockerfile.sero-node');

function manifestWithRtkVersion(...versions: Array<string | undefined>): ToolchainManifest {
  return {
    version: 'test',
    artifacts: Object.fromEntries(versions.map((version, index) => [
      `rtk-test-${index}`,
      {
        tool: 'rtk' as const,
        platform: 'linux' as const,
        arch: 'x64' as const,
        url: 'https://downloads.example.test/rtk.tar.gz',
        sha256: 'a'.repeat(64),
        unpackTo: `rtk-test-${index}`,
        binPaths: { rtk: `rtk-test-${index}/rtk` },
        version,
        minVersion: version,
        managedOnly: true,
        installPolicy: 'on-demand' as const,
      },
    ])),
  };
}

describe('rtk image pin', () => {
  it('keeps Dockerfile.sero-node and the toolchain manifest on one exact version', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    const manifest = loadBundledToolchainManifest();

    expect(() => assertRtkImagePinMatchesManifest(dockerfile, manifest)).not.toThrow();
    expect(rtkImageVersion(dockerfile)).toBe('0.49.0');
  });

  it('parses only ARG declarations', () => {
    const args = parseDockerfileBuildArgs([
      'FROM ubuntu:24.04',
      'ARG RTK_VERSION=1.2.3',
      'RUN echo "RTK_VERSION=9.9.9"',
      'ENV RTK_VERSION=9.9.9',
      '',
    ].join('\n'));

    expect(args).toEqual({ RTK_VERSION: '1.2.3' });
  });

  it('fails when the image declaration changes alone', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8').replace('ARG RTK_VERSION=0.49.0', 'ARG RTK_VERSION=0.50.0');

    expect(() => assertRtkImagePinMatchesManifest(dockerfile, loadBundledToolchainManifest())).toThrow(/RTK version drift/);
  });

  it('fails when the manifest pin changes alone', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(() => assertRtkImagePinMatchesManifest(dockerfile, manifestWithRtkVersion('0.48.0'))).toThrow(/RTK version drift/);
  });

  it('fails when the Dockerfile omits the pin', () => {
    expect(() => assertRtkImagePinMatchesManifest('FROM scratch\n', manifestWithRtkVersion('0.49.0'))).toThrow(
      /does not declare ARG RTK_VERSION/,
    );
  });

  it('fails when the manifest pins more than one rtk version', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(() => assertRtkImagePinMatchesManifest(dockerfile, manifestWithRtkVersion('0.49.0', '0.49.0', '0.50.0'))).toThrow(
      /exactly one rtk version/,
    );
  });
});
