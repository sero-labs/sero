/**
 * Container image management — check if sero-node image exists, build if not.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

import { CONTAINER_BIN, DEFAULT_IMAGE } from './types';

const execFileAsync = promisify(execFile);

/**
 * Check if the sero-node image is available locally.
 */
export async function imageExists(imageName = DEFAULT_IMAGE): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['image', 'list'], {
      timeout: 10_000,
    });
    // Image name is "sero-node" and tag is "latest" — check for "sero-node" in the list
    const name = imageName.split(':')[0];
    return stdout.includes(name);
  } catch {
    return false;
  }
}

/**
 * Build the sero-node image from the Dockerfile.
 * The Dockerfile is expected at apps/desktop/images/Dockerfile.sero-node
 * relative to the project root.
 *
 * @param dockerfilePath - Absolute path to the Dockerfile
 */
export async function buildImage(
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
 * Ensure the sero-node image is available. Builds it if missing.
 *
 * @param imagesDir - Directory containing Dockerfile.sero-node
 */
export async function ensureImage(imagesDir: string): Promise<void> {
  const exists = await imageExists();
  if (exists) {
    console.log('[container] sero-node:latest image already available');
    return;
  }

  const dockerfilePath = path.join(imagesDir, 'Dockerfile.sero-node');
  await buildImage(dockerfilePath);
}
