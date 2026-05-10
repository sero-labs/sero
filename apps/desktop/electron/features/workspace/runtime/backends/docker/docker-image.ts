import { existsSync } from 'fs';
import path from 'path';
import { DEFAULT_IMAGE, seroNodeImageVersionFromRef } from '@electron/features/container/core/types';
import { checkDocker, type DockerRunner } from './docker-cli';

export interface DockerImageEnsureResult {
  imageRef: string;
  source: 'local' | 'pulled' | 'built';
}

export interface DockerImageOptions {
  imageRef?: string;
  imagesDir?: string;
  run?: DockerRunner;
}

export function dockerImagesDir(): string {
  return path.resolve(process.cwd(), 'apps/desktop/images');
}

export async function ensureDockerImage(options: DockerImageOptions = {}): Promise<DockerImageEnsureResult> {
  const imageRef = options.imageRef ?? DEFAULT_IMAGE;
  const run = options.run ?? checkDocker;

  const inspect = await run(['image', 'inspect', imageRef], { timeoutMs: 10_000 });
  if (inspect.exitCode === 0) return { imageRef, source: 'local' };

  const pull = await run(['pull', imageRef], { timeoutMs: 300_000 });
  if (pull.exitCode === 0) return { imageRef, source: 'pulled' };

  const imagesDir = options.imagesDir ?? dockerImagesDir();
  const dockerfilePath = path.join(imagesDir, 'Dockerfile.sero-node');
  if (!existsSync(dockerfilePath)) {
    throw new Error(`Docker image ${imageRef} is unavailable; pull failed and Dockerfile was not found at ${dockerfilePath}. ${pull.stderr}`.trim());
  }

  const build = await run(['build', '-t', imageRef, '--build-arg', `SERO_NODE_VERSION=${seroNodeImageVersionFromRef(imageRef)}`, '-f', 'Dockerfile.sero-node', '.'], {
    cwd: imagesDir,
    timeoutMs: 300_000,
  });
  if (build.exitCode !== 0) {
    throw new Error(`Docker image ${imageRef} is unavailable; pull and local build failed. ${build.stderr || pull.stderr}`.trim());
  }

  return { imageRef, source: 'built' };
}
