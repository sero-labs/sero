import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { DockerCommandResult } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { ensureDockerImage } from '@electron/features/workspace/runtime/backends/docker/docker-image';

it('builds the fallback image from the repository root', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'sero-image-context-'));
  const imagesDir = path.join(projectRoot, 'apps/desktop/images');
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  mkdirSync(imagesDir, { recursive: true });
  writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

  await ensureDockerImage({
    imageRef: 'image:context',
    imagesDir,
    run: vi.fn(async (args: string[], options) => {
      calls.push({ args, cwd: options?.cwd });
      if (args[0] === 'build') return result(0, 'built');
      if (args[0] === 'image' && calls.some((call) => call.args[0] === 'build')) {
        return result(0, JSON.stringify([{ Id: 'context-id' }]));
      }
      if (args[0] === 'run') return result(0, 'toolchain');
      return result(1, '', 'missing');
    }),
  });

  expect(calls.find(({ args }) => args[0] === 'build')).toEqual({
    args: expect.arrayContaining(['-f', 'apps/desktop/images/Dockerfile.sero-node', '.']),
    cwd: projectRoot,
  });
});

function result(exitCode: number, stdout = '', stderr = ''): DockerCommandResult {
  return { exitCode, stdout, stderr };
}
