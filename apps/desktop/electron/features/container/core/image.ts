/**
 * Container image management — check if the public sero-node image exists,
 * pull it when missing, and fall back to a local Dockerfile build in dev.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

import { CONTAINER_BIN, DEFAULT_IMAGE } from './types';

const execFileAsync = promisify(execFile);

function imageNameParts(imageName: string): { name: string; tag: string } {
  const lastSlash = imageName.lastIndexOf('/');
  const tagSeparator = imageName.indexOf(':', lastSlash + 1);
  if (tagSeparator === -1) return { name: imageName, tag: 'latest' };
  return {
    name: imageName.slice(0, tagSeparator),
    tag: imageName.slice(tagSeparator + 1),
  };
}

/**
 * Check if the sero-node image is available locally.
 */
async function imageExists(imageName = DEFAULT_IMAGE): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['image', 'list'], {
      timeout: 10_000,
    });
    const expected = imageNameParts(imageName);
    return stdout
      .split('\n')
      .slice(1)
      .some((line) => {
        const [name, tag] = line.trim().split(/\s+/);
        return name === expected.name && tag === expected.tag;
      });
  } catch {
    return false;
  }
}

async function pullImage(imageName = DEFAULT_IMAGE): Promise<void> {
  console.log(`[container] Pulling image ${imageName}...`);
  try {
    await execFileAsync(CONTAINER_BIN, ['image', 'pull', imageName], {
      timeout: 300_000,
    });
    console.log(`[container] Image ${imageName} pulled successfully`);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    throw new Error(`Failed to pull image ${imageName}: ${e.stderr || (err instanceof Error ? err.message : String(err))}`);
  }
}

/**
 * Build the sero-node image from the Dockerfile.
 * The Dockerfile is expected at apps/desktop/images/Dockerfile.sero-node
 * relative to the project root.
 *
 * @param dockerfilePath - Absolute path to the Dockerfile
 */
async function buildImage(
  dockerfilePath: string,
  imageName = DEFAULT_IMAGE,
): Promise<void> {
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found: ${dockerfilePath}`);
  }

  const contextDir = path.dirname(dockerfilePath);
  const filename = path.basename(dockerfilePath);

  console.log(`[container] Building image ${imageName} from ${dockerfilePath}...`);

  try {
    await execFileAsync(
      CONTAINER_BIN,
      ['build', '-t', imageName, '-f', filename, '.'],
      {
        cwd: contextDir,
        timeout: 300_000, // 5 minutes — image builds can be slow
      },
    );
    console.log(`[container] Image ${imageName} built successfully`);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    throw new Error(`Failed to build image ${imageName}: ${e.stderr || (err instanceof Error ? err.message : String(err))}`);
  }
}

/**
 * Ensure the sero-node image is available. Pulls the public image first and
 * falls back to a local Dockerfile build for offline development checkouts.
 *
 * @param imagesDir - Directory containing Dockerfile.sero-node
 */
export async function ensureImage(imagesDir: string): Promise<void> {
  const exists = await imageExists();
  if (exists) {
    console.log(`[container] ${DEFAULT_IMAGE} image already available`);
    return;
  }

  try {
    await pullImage();
    return;
  } catch (err) {
    console.warn(`[container] Public image pull failed; falling back to local build: ${err instanceof Error ? err.message : String(err)}`);
  }

  const dockerfilePath = path.join(imagesDir, 'Dockerfile.sero-node');
  await buildImage(dockerfilePath);
}
