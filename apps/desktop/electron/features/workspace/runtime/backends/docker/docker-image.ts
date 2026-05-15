import { existsSync } from 'fs';
import path from 'path';
import { DEFAULT_IMAGE, seroNodeImageVersionFromRef } from '@electron/features/container/core/types';
import { checkDocker, type DockerRunner } from './docker-cli';

export interface DockerImageEnsureResult {
  imageRef: string;
  imageId?: string;
  source: 'local' | 'pulled' | 'built';
}

export interface DockerImageOptions {
  imageRef?: string;
  imagesDir?: string;
  run?: DockerRunner;
}

export function dockerImagesDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'apps/desktop/images'),
    path.resolve(cwd, 'images'),
  ];

  return candidates.find((dir) => existsSync(path.join(dir, 'Dockerfile.sero-node'))) ?? candidates[0];
}

const verifiedToolchainImageIds = new Set<string>();

const TOOLCHAIN_CHECK = [
  'command -v bash >/dev/null',
  'command -v git >/dev/null',
  'command -v node >/dev/null',
  'command -v python3 >/dev/null',
  'command -v agent-browser >/dev/null',
  'test -d /ms-playwright',
  'test -r /ms-playwright',
  'find /ms-playwright -path "*/chrome-linux/chrome" -type f -perm -111 -print -quit | grep -q .',
  'find /ms-playwright -path "*/ffmpeg-linux" -type f -perm -111 -print -quit | grep -q .',
].join(' && ');

export async function ensureDockerImage(options: DockerImageOptions = {}): Promise<DockerImageEnsureResult> {
  const imageRef = options.imageRef ?? DEFAULT_IMAGE;
  const run = options.run ?? checkDocker;

  const inspect = await run(['image', 'inspect', imageRef], { timeoutMs: 10_000 });
  if (inspect.exitCode === 0) {
    const imageId = imageIdFromInspect(inspect.stdout);
    if (await imageHasRequiredToolchain(run, imageRef, imageId)) return { imageRef, imageId, source: 'local' };
  }

  const pull = await run(['pull', imageRef], { timeoutMs: 300_000 });
  if (pull.exitCode === 0) {
    const pulledId = await inspectImageId(run, imageRef);
    if (await imageHasRequiredToolchain(run, imageRef, pulledId)) return { imageRef, imageId: pulledId, source: 'pulled' };
  }

  const imagesDir = options.imagesDir ?? dockerImagesDir();
  const dockerfilePath = path.join(imagesDir, 'Dockerfile.sero-node');
  if (!existsSync(dockerfilePath)) {
    throw new Error(`Docker image ${imageRef} is unavailable or missing the Sero runtime toolchain; pull failed and Dockerfile was not found at ${dockerfilePath}. ${pull.stderr}`.trim());
  }

  const build = await run(['build', '-t', imageRef, '--build-arg', `SERO_NODE_VERSION=${seroNodeImageVersionFromRef(imageRef)}`, '-f', 'Dockerfile.sero-node', '.'], {
    cwd: imagesDir,
    timeoutMs: 300_000,
  });
  if (build.exitCode !== 0) {
    throw new Error(`Docker image ${imageRef} is unavailable or missing the Sero runtime toolchain, and local build failed. ${build.stderr || pull.stderr}`.trim());
  }

  const builtId = await inspectImageId(run, imageRef);
  if (!await imageHasRequiredToolchain(run, imageRef, builtId)) {
    throw new Error(`Docker image ${imageRef} was built but is missing the Sero runtime toolchain.`);
  }

  return { imageRef, imageId: builtId, source: 'built' };
}

async function imageHasRequiredToolchain(run: DockerRunner, imageRef: string, imageId?: string): Promise<boolean> {
  if (imageId && verifiedToolchainImageIds.has(imageId)) return true;
  const result = await run(['run', '--rm', imageRef, 'sh', '-lc', TOOLCHAIN_CHECK], { timeoutMs: 60_000 });
  if (result.exitCode !== 0) return false;
  if (imageId) verifiedToolchainImageIds.add(imageId);
  return true;
}

async function inspectImageId(run: DockerRunner, imageRef: string): Promise<string | undefined> {
  const inspect = await run(['image', 'inspect', imageRef], { timeoutMs: 10_000 });
  return inspect.exitCode === 0 ? imageIdFromInspect(inspect.stdout) : undefined;
}

function imageIdFromInspect(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!first || typeof first !== 'object') return undefined;
    const id = (first as { Id?: unknown }).Id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}
