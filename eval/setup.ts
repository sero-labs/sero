/**
 * Temp directory setup/teardown for eval runs.
 *
 * Each eval scenario gets an isolated temp dir so file-writing tools
 * don't collide across concurrent runs.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function setupTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'sero-eval-'));
}

export async function teardownTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
